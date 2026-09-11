const http = require('node:http');
const path = require('node:path');
const {execFile} = require('node:child_process');

const PUBLISH_PORT = Number(process.env.TINA_PUBLISH_PORT || 4002);
const PUBLISH_PATH = '/__tina/publish';

// Content Tina is allowed to write. Everything else in the repo (config, the
// dev tooling, workflows) is deliberately out of scope for a publish.
const CONTENT_DIRS = ['my-website/docs', 'my-website/blog', 'my-website/static'];

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {cwd, maxBuffer: 10 * 1024 * 1024}, (err, stdout, stderr) => {
      if (err) {
        const e = new Error((stderr || stdout || err.message).trim());
        e.command = `${cmd} ${args.join(' ')}`;
        reject(e);
        return;
      }
      // Trailing whitespace only: `git status --porcelain` encodes the index
      // status in column 1, so a leading space is significant.
      resolve(stdout.replace(/\s+$/, ''));
    });
  });
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'edit'
  );
}

async function getState(repoRoot) {
  const branch = (
    await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot)
  ).trim();
  const status = await run(
    'git',
    ['status', '--porcelain', '--', ...CONTENT_DIRS],
    repoRoot,
  );
  const files = status
    .split('\n')
    .filter(Boolean)
    // `XY path`, or `XY old -> new` for a rename.
    .map((line) => line.slice(3).split(' -> ').pop().trim());
  return {branch, files};
}

async function publish(repoRoot, title) {
  const {branch: baseBranch, files} = await getState(repoRoot);
  if (files.length === 0) {
    const err = new Error('No content changes to publish.');
    err.status = 400;
    throw err;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const prBranch = `tina/${slugify(title)}-${stamp}`;

  await run('git', ['checkout', '-b', prBranch], repoRoot);
  try {
    // Only the content paths are staged, so unrelated working-tree changes are
    // left alone and survive the checkout back to the base branch.
    await run('git', ['add', '--', ...CONTENT_DIRS], repoRoot);
    await run('git', ['commit', '-m', title], repoRoot);
    await run('git', ['push', '-u', 'origin', prBranch], repoRoot);
    const prUrl = await run(
      'gh',
      [
        'pr', 'create',
        '--base', baseBranch,
        '--head', prBranch,
        '--title', title,
        '--body', `Edited in TinaCMS.\n\n${files.map((f) => `- \`${f}\``).join('\n')}`,
      ],
      repoRoot,
    );
    // Back to the base branch: the edit now lives in the PR, and the local
    // preview shows what is actually published.
    await run('git', ['checkout', baseBranch], repoRoot);
    return {
      url: prUrl.trim().split('\n').pop(),
      branch: prBranch,
      baseBranch,
      files,
    };
  } catch (err) {
    err.message = `${err.message}\n\nYour commit is on the branch ${prBranch}; you are still on it.`;
    throw err;
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * A tiny localhost-only HTTP server that turns the working tree's content
 * changes into a pull request.
 *
 * It runs git and gh with the codespace's own credentials, so it is bound to
 * the loopback interface and reached only through the Docusaurus dev server's
 * proxy — the same private, GitHub-authenticated port as the CMS itself, which
 * can already write these files.
 */
function startPublishServer(siteDir) {
  const repoRoot = path.resolve(siteDir, '..');

  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith(PUBLISH_PATH)) {
      json(res, 404, {error: 'Not found'});
      return;
    }
    try {
      if (req.method === 'GET') {
        json(res, 200, await getState(repoRoot));
        return;
      }
      if (req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
        const title = (body.title || '').trim() || 'Update docs';
        json(res, 200, await publish(repoRoot, title));
        return;
      }
      json(res, 405, {error: 'Method not allowed'});
    } catch (err) {
      json(res, err.status || 500, {error: err.message, command: err.command});
    }
  });

  server.listen(PUBLISH_PORT, '127.0.0.1');
  server.unref();
  return server;
}

module.exports = {PUBLISH_PATH, PUBLISH_PORT, startPublishServer};
