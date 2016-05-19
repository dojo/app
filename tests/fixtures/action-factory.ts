import { ActionFactory, CombinedRegistry } from 'src/App';

let factory: ActionFactory = null;

export function stub (stub: ActionFactory) {
	factory = stub;
}

export default function (registry: CombinedRegistry) {
	return factory(registry);
}
