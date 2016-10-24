import { Handle } from 'dojo-core/interfaces';
import { includes } from 'dojo-shim/array';
import Map from 'dojo-shim/Map';
import Promise from 'dojo-shim/Promise';
import WeakMap from 'dojo-shim/WeakMap';
import { createProjector, Projector } from 'dojo-widgets/projector';
import { List } from 'immutable';

import {
	Identifier,
	ReadOnlyRegistry,
	WidgetLike
} from '../createApp';

export type SceneElement = SceneProjector | SceneWidget;

export interface SceneProjector {
	projector: true;
	append: SceneWidget[];
}

function isSceneProjector(element: any): element is SceneProjector {
	return element.projector === true;
}

export interface SceneWidget {
	widget: Identifier;
}

interface Key<T> {
	value: T;
}

// FIXME: Each level in the tree needs its own counter, then combine them to generate a unique string…
interface Counter {
	value: number;
}

interface RenderState {
	root: Element;
	children: WeakMap<Key<any>, Key<any>[]>;
	handles: WeakMap<Key<any>, Handle>;
	projectorKeys: Map<number, Key<number>>;
	projectors: WeakMap<Key<number>, Projector>;
	widgetKeys: Map<Identifier, Key<Identifier>>;
	widgets: WeakMap<Key<Identifier>, WidgetLike>;
}

const renderState = new WeakMap<ReadOnlyRegistry, RenderState>();

export function render(registry: ReadOnlyRegistry, root: Element, tree: SceneElement) {
	if (!isSceneProjector(tree)) {
		return Promise.reject(new Error('Tree must start with a SceneProjector for now, sorry'));
	}

	const state = renderState.get(registry) || {
		root,
		children: new WeakMap<Key<any>, Key<any>[]>(),
		handles: new WeakMap<Key<any>, Handle>(),
		projectorKeys: new Map<number, Key<number>>(),
		projectors: new WeakMap<Key<number>, Projector>(),
		widgetKeys: new Map<Identifier, Key<Identifier>>(),
		widgets: new WeakMap<Key<Identifier>, WidgetLike>()
	};
	if (!renderState.has(registry)) {
		renderState.set(registry, state);
	}

	return update(registry, state, { value: 0 }, tree)
		.then(() => {
			return {
				destroy() {
					state.projectorKeys.forEach((key) => {
						if (state.handles.has(key)) {
							state.handles.get(key).destroy();
						}
					});
					state.widgetKeys.forEach((key) => {
						if (state.handles.has(key)) {
							state.handles.get(key).destroy();
						}
					});
				}
			};
		});
}

function update(
	registry: ReadOnlyRegistry,
	state: RenderState,
	counter: Counter,
	tree: SceneProjector
): Promise<void> {
	const projectorId = counter.value++;
	const projectorKey = state.projectorKeys.get(projectorId) || { value: projectorId };
	if (!state.projectorKeys.has(projectorId)) {
		state.projectorKeys.set(projectorId, projectorKey);
	}

	// TODO: Check if projector is different (once more options are supported)
	const projector = state.projectors.get(projectorKey) || createProjector({ root: state.root });
	if (!state.projectors.has(projectorKey)) {
		state.projectors.set(projectorKey, projector);
		state.children.set(projectorKey, []);
		state.handles.set(projectorKey, {
			destroy() {
				state.projectorKeys.delete(projectorKey.value);
			}
		});
	}

	return updateProjectorChildren(registry, state, counter, projectorKey, projector, tree.append)
		.then(() => {
			projector.attach();
		});
}

function updateProjectorChildren(
	registry: ReadOnlyRegistry,
	state: RenderState,
	counter: Counter,
	projectorKey: Key<number>,
	projector: Projector,
	append: SceneWidget[]
): Promise<void> {
	interface Child {
		key: Key<Identifier>;
		widget: WidgetLike;
	}
	const children: (Promise<Child> | Child)[] = append.map(({ widget: value }) => {
		const key = state.widgetKeys.get(value) || { value };
		if (!state.widgetKeys.has(value)) {
			state.widgetKeys.set(value, key);
		}

		const widget = state.widgets.get(key);
		if (widget) {
			return { key, widget };
		}

		return registry.getWidget(value).then((widget) => {
			state.widgets.set(key, widget);
			state.handles.set(key, {
				destroy() {
					widget.destroy();
					state.widgetKeys.delete(key.value);
				}
			});
			return { key, widget };
		});
	});

	return Promise.all(children)
		.then((children) => {
			const newKeys = children.map(({ key }) => key);
			const previousKeys = state.children.get(projectorKey);
			for (const key of previousKeys) {
				if (!includes(newKeys, key)) {
					// TODO: It follows that any registered widget instances should override their destroy() method, as
					// destruction would prevent them from being reused. Alternatively we could communicate destroyability through
					// the registry.
					//
					// Also, upon destruction factories should revert to creating a new instance. And if a factory always returns
					// the same instance then the above applies.
					state.handles.get(key).destroy();
				}
			}

			projector.children = List(children.map(({ widget }) => widget));
		});
}
