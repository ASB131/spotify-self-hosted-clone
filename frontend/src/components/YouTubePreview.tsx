"use client";

type Props = {
  videoId: string;
  title: string;
  onClose?: () => void;
};

/** Standard YouTube embed with native controls. */
export function YouTubePreview({ videoId, title, onClose }: Props) {
  return (
    <div className="px-2 pb-3">
      <div className="aspect-video max-w-xl rounded-md overflow-hidden bg-black border border-white/10 relative">
        <iframe
          title={title}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2 right-2 z-10 text-xs bg-black/70 hover:bg-black text-white px-2 py-1 rounded"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
