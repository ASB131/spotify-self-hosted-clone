import Link from "next/link";

export default function ExtensionInstallPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Install the Chrome extension</h1>
      <ol className="list-decimal list-inside space-y-3 text-muted text-sm">
        <li>
          Download the zip from{" "}
          <Link href="/profile" className="text-spotify underline">
            Profile
          </Link>
          .
        </li>
        <li>
          Unzip to a folder, for example{" "}
          <code className="text-white bg-[#242424] px-1.5 py-0.5 rounded">Downloads/media-player-extension</code>.
        </li>
        <li>
          Open Chrome → <code className="text-white bg-[#242424] px-1.5 py-0.5 rounded">chrome://extensions</code>.
        </li>
        <li>
          Enable <strong className="text-white">Developer mode</strong>, then{" "}
          <strong className="text-white">Load unpacked</strong> and pick that folder.
        </li>
        <li>
          Open{" "}
          <Link href="/extension/connect" className="text-spotify underline">
            Extension connect
          </Link>{" "}
          and send your token.
        </li>
        <li>
          On YouTube, use <strong className="text-white">Save to Media player</strong>.
        </li>
      </ol>
      <Link href="/profile" className="inline-block mt-8 text-spotify underline text-sm">
        Back to profile
      </Link>
    </div>
  );
}
