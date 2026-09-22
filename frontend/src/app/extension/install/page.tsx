import Link from "next/link";

export default function ExtensionInstallPage() {
  return (
    <div className="min-h-screen bg-surface text-white p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Install the Resonance Chrome extension</h1>
      <ol className="list-decimal list-inside space-y-4 text-muted">
        <li>
          Download the zip from{" "}
          <Link href="/profile" className="text-spotify underline">
            Profile → Download extension
          </Link>
          .
        </li>
        <li>Unzip to a folder, for example <code className="text-white">Downloads/resonance-extension</code>.</li>
        <li>
          Open Chrome →{" "}
          <code className="text-white bg-panel px-2 py-1 rounded">chrome://extensions</code>.
        </li>
        <li>Enable <strong className="text-white">Developer mode</strong>, then <strong className="text-white">Load unpacked</strong> and pick that folder.</li>
        <li>
          If you already loaded it before, click the <strong className="text-white">Reload</strong> button on the
          extension card after downloading a new zip.
        </li>
        <li>
          Open{" "}
          <Link href="/extension/connect" className="text-spotify underline">
            Extension connect
          </Link>
          , copy API URL + token, then open extension <strong className="text-white">Options</strong> and Save.
        </li>
        <li>
          On YouTube, use <strong className="text-white">Save to Resonance</strong>. Downloads are queued via the
          extension background worker (not the YouTube page), so CORS_ORIGINS is optional for this flow.
        </li>
      </ol>
      <Link href="/profile" className="inline-block mt-8 text-spotify underline">
        Back to profile
      </Link>
    </div>
  );
}
