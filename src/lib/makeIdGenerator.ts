export default function makeIdGenerator(prefix: string): () => string {
	let count = 0;
	return () => prefix + (++count);
}
