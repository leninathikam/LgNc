// Local, key-free embeddings via Transformers.js (all-MiniLM-L6-v2).
// The model (~25MB) is downloaded once on first use and cached on disk.
// If anything fails (offline first run, etc.), we degrade gracefully to null
// embeddings and the memory engine falls back to recency-based retrieval.

type FeatureExtractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let extractorPromise: Promise<FeatureExtractor | null> | null = null;

async function getExtractor(): Promise<FeatureExtractor | null> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        const { pipeline, env } = await import("@xenova/transformers");
        // Keep everything local; allow downloading the model on first run.
        env.allowLocalModels = true;
        const pipe = await pipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2",
        );
        return pipe as unknown as FeatureExtractor;
      } catch (err) {
        console.warn(
          "[lgnc/core] Local embeddings unavailable, falling back to recency memory.",
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    })();
  }
  return extractorPromise;
}

/** Returns a normalized embedding vector, or null if embeddings are unavailable. */
export async function embed(text: string): Promise<Float32Array | null> {
  const extractor = await getExtractor();
  if (!extractor) return null;
  try {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Float32Array.from(output.data as ArrayLike<number>);
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function vectorToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToVector(blob: Buffer | Uint8Array): Float32Array {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}
