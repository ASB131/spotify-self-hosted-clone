import Link from "next/link";

export default function ExtensionInstallPage() {
  return (
    <div className="min-h-screen bg-surface text-white p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Install the Resonance Chrome extension</h1>
      <ol className="list-decimal list-inside space-y-4 text-muted">
        <li>
          Download the zip from{" "}
          <Link href="/profile" className="text-spotify underline">
            Profile → Add Chrome extension
          </Link>{" "}
          if you have not already.
        </li>
        <li>Unzip to a folder, for example <code className="text-white">Downloads/resonance-extension</code>.</li>
        <li>
          Open Chrome and go to{" "}
          <code className="text-white bg-panel px-2 py-1 rounded">chrome://extensions</code> (copy/paste into the
          address bar).
        </li>
        <li>Enable <strong className="text-white">Developer mode</strong> (top right).</li>
        <li>Click <strong className="text-white">Load unpacked</strong> and select the unzipped folder.</li>
        <li>Open the extension options (puzzle icon → Resonance → Options).</li>
        <li>
          Set API URL to <code className="text-white">http://localhost:8000</code> (or your server) and paste your JWT
          access token from the web app (browser DevTools → Application → Session Storage →{" "}
          <code className="text-white">access_token</code>).
        </li>
        <li>
          Add your extension ID to <code className="text-white">CORS_ORIGINS</code> in <code className="text-white">.env</code>{" "}
          as <code className="text-white">chrome-extension://YOUR_ID</code> and restart the API container.
        </li>
      </ol>
      <Link href="/profile" className="inline-block mt-8 text-spotify underline">
        Back to profile
      </Link>
    </div>
  );
}
