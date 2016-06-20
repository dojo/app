import { EventedListenersMap } from 'dojo-compose/mixins/createEvented';
import Promise from 'dojo-core/Promise';

import {
	CombinedRegistry,
	WidgetListenersMap,
	WidgetListenerOrArray
} from './createApp';

function resolveListeners(registry: CombinedRegistry, ref: WidgetListenerOrArray): { value?: any; promise?: Promise<any>; } {
	if (Array.isArray(ref)) {
		const resolved = ref.map((item) => {
			return resolveListeners(registry, item);
		});

		let isSync = true;
		const values: any[] = [];
		for (const result of resolved) {
			if (result.value) {
				values.push(result.value);
			} else {
				isSync = false;
				values.push(result.promise);
			}
		}

		return isSync ? { value: values } : { promise: Promise.all(values) };
	}

	if (typeof ref !== 'string') {
		return { value: ref };
	}

	return { promise: registry.getAction(<string> ref) };
}

export default function resolveListenersMap(registry: CombinedRegistry, listeners: WidgetListenersMap): Promise<EventedListenersMap> {
	if (!listeners) {
		return null;
	}

	const map: EventedListenersMap = {};
	const eventTypes = Object.keys(listeners);
	return eventTypes.reduce((promise, eventType) => {
		const resolved = resolveListeners(registry, listeners[eventType]);
		if (resolved.value) {
			map[eventType] = resolved.value;
			return promise;
		}

		return resolved.promise.then((value) => {
			map[eventType] = value;
			return promise;
		});
	}, Promise.resolve(map));
}
