import * as React from "react";
import { GitPullRequest } from "lucide-react";

const PUBLISH_URL = "/__tina/publish";

const e = React.createElement;

type State = {
  branch: string;
  files: string[];
};

type Result = {
  url: string;
  branch: string;
  baseBranch: string;
  files: string[];
};

/**
 * Turns the edits Tina has written to disk into a pull request, via the
 * dev-only endpoint in dev/publish-server.js.
 */
const PublishScreen = () => {
  const [state, setState] = React.useState<State | null>(null);
  const [title, setTitle] = React.useState("Update docs");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    fetch(PUBLISH_URL)
      .then((r) => r.json())
      .then((data) => (data.error ? setError(data.error) : setState(data)))
      .catch((err) => setError(String(err)));
  }, []);

  React.useEffect(refresh, [refresh]);

  const publish = () => {
    setBusy(true);
    setError(null);
    fetch(PUBLISH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setResult(data);
          refresh();
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setBusy(false));
  };

  const label = (text: string) =>
    e("h4", { className: "font-bold text-sm mb-2 text-gray-700" }, text);

  if (result) {
    return e(
      "div",
      { className: "p-6 space-y-4 text-sm" },
      label("Pull request opened"),
      e(
        "a",
        {
          href: result.url,
          target: "_blank",
          rel: "noreferrer",
          className: "text-blue-600 underline break-all",
        },
        result.url
      ),
      e(
        "p",
        { className: "text-gray-600" },
        `Your edit is on ${result.branch}. This checkout is back on ${result.baseBranch}, so the preview again shows what is published.`
      ),
      e(
        "button",
        {
          className:
            "px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-700",
          onClick: () => setResult(null),
        },
        "Done"
      )
    );
  }

  const files = state?.files ?? [];

  return e(
    "div",
    { className: "p-6 space-y-4 text-sm" },
    error &&
      e(
        "pre",
        {
          className:
            "p-3 rounded bg-red-50 text-red-700 whitespace-pre-wrap break-all",
        },
        error
      ),
    label("Changed content"),
    files.length === 0
      ? e(
          "p",
          { className: "text-gray-500" },
          "Nothing to publish — save an edit first."
        )
      : e(
          "ul",
          { className: "font-mono text-xs space-y-1 text-gray-700" },
          files.map((f) => e("li", { key: f }, f))
        ),
    label("Pull request title"),
    e("input", {
      className: "w-full px-3 py-2 rounded border border-gray-200",
      value: title,
      onChange: (ev: React.ChangeEvent<HTMLInputElement>) =>
        setTitle(ev.target.value),
    }),
    e(
      "button",
      {
        className:
          "px-4 py-2 rounded bg-blue-500 text-white disabled:opacity-50",
        disabled: busy || files.length === 0,
        onClick: publish,
      },
      busy ? "Publishing…" : "Publish"
    ),
    e(
      "p",
      { className: "text-gray-500" },
      state?.branch ? `Branching off ${state.branch}.` : ""
    )
  );
};

export const publishScreenPlugin = {
  __type: "screen",
  name: "Publish",
  Icon: GitPullRequest,
  layout: "popup",
  Component: PublishScreen,
};
