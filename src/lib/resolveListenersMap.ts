import { EventedListener, EventedListenersMap, EventedListenerOrArray, TargettedEventObject } from 'dojo-compose/mixins/createEvented';
import Promise from 'dojo-shim/Promise';

import {
	ReadOnlyRegistry,
	WidgetListenersMap,
	WidgetListenerOrArray
} from '../createApp';

function resolveListeners(registry: ReadOnlyRegistry, ref: WidgetListenerOrArray): [EventedListenerOrArray<TargettedEventObject>, Promise<EventedListenerOrArray<TargettedEventObject>>] {
	if (Array.isArray(ref)) {
		let isSync = true;
		const results: (EventedListener<TargettedEventObject> | Promise<EventedListener<TargettedEventObject>>)[] = [];
		for (const item of ref) {
			const [value, promise] = <[EventedListener<TargettedEventObject>, Promise<EventedListener<TargettedEventObject>>]> resolveListeners(registry, item);
			if (value) {
				results.push(value);
			}
			else {
				isSync = false;
				results.push(promise);
			}
		}

		if (isSync) {
			return [<EventedListener<TargettedEventObject>[]> results, undefined];
		}
		return [undefined, Promise.all(results)];
	}

	if (typeof ref !== 'string') {
		return [<EventedListener<TargettedEventObject>> ref, undefined];
	}

	return [undefined, registry.getAction(<string> ref)];
}

export default function resolveListenersMap(registry: ReadOnlyRegistry, listeners: WidgetListenersMap): Promise<EventedListenersMap> {
	if (!listeners) {
		return null;
	}

	const map: EventedListenersMap = {};
	const eventTypes = Object.keys(listeners);
	return eventTypes.reduce((promise, eventType) => {
		const [value, listenersPromise] = resolveListeners(registry, listeners[eventType]);
		if (value) {
			map[eventType] = value;
			return promise;
		}

		return listenersPromise.then((value) => {
			map[eventType] = value;
			return promise;
		});
	}, Promise.resolve(map));
}
