import { ActionFactory, CombinedRegistry, StoreLike } from 'src/createApp';

let factory: ActionFactory = null;

export function stub (stub: ActionFactory) {
	factory = stub;
}

export default function (registry: CombinedRegistry, store: StoreLike) {
	return factory(registry, store);
}
