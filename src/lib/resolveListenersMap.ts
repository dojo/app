import { EventedListener, EventedListenersMap, TargettedEventObject } from 'dojo-compose/mixins/createEvented';
import Promise from 'dojo-shim/Promise';

import {
	ReadOnlyRegistry,
	WidgetListenersMap,
	WidgetListenerOrArray
} from '../createApp';

// Use generics to avoid annoying repetition of the EventedListener<TargettedEventObject> type.
type ResolvedListeners<T> = [T[], undefined] | [undefined, Promise<T[]>];
function carriesValue<T>(result: ResolvedListeners<T>): result is [T[], undefined] {
	return result[0] !== undefined;
}

type MixedResultOverride<T> = {
	// Property on the array to track whether it contains promises, which makes the withoutPromises() type
	// guard possible.
	containsPromises?: boolean;
	// These seem to need to be redeclared. Declared them as narrowly as possible for the actual usage below.
	push(result: T[]): number;
	push(result: Promise<T[]>): number;
};
type MixedResults<T> = (T[][] | (T[] | Promise<T[]>)[]) & MixedResultOverride<T>;
function withoutPromises<T>(mixed: MixedResults<T>): mixed is T[][] & MixedResultOverride<T> {
	return mixed.containsPromises !== true;
}

function resolveListeners(
	registry: ReadOnlyRegistry,
	ref: WidgetListenerOrArray
): ResolvedListeners<EventedListener<TargettedEventObject>> {
	if (Array.isArray(ref)) {
		const mixed: MixedResults<EventedListener<TargettedEventObject>> = [];
		for (const item of ref) {
			const result = resolveListeners(registry, item);
			if (carriesValue(result)) {
				mixed.push(result[0]);
			}
			else {
				mixed.containsPromises = true;
				mixed.push(result[1]);
			}
		}

		const flattened: EventedListener<TargettedEventObject>[] = [];
		if (withoutPromises(mixed)) {
			return [flattened.concat(...mixed), undefined];
		}

		return [
			undefined,
			Promise.all(mixed)
				.then((results) => flattened.concat(...results))
		];
	}

	if (typeof ref !== 'string') {
		return [ [ <EventedListener<TargettedEventObject>> ref ], undefined ];
	}

	return [
		undefined,
		registry.getAction(ref).then((action) => [ action ])
	];
}

export default function resolveListenersMap(registry: ReadOnlyRegistry, listeners?: WidgetListenersMap): null | Promise<EventedListenersMap> {
	if (!listeners) {
		return null;
	}

	const map: EventedListenersMap = {};
	const eventTypes = Object.keys(listeners);
	return eventTypes.reduce((promise, eventType) => {
		const result = resolveListeners(registry, listeners[eventType]);
		if (carriesValue(result)) {
			const arr = result[0];
			map[eventType] = arr.length > 1 ? arr : arr[0];
			return promise;
		}

		return result[1].then((arr) => {
			map[eventType] = arr.length > 1 ? arr : arr[0];
			return promise;
		});
	}, Promise.resolve(map));
}
