import { Handle } from 'dojo-core/interfaces';
import Map from 'dojo-shim/Map';
import Promise from 'dojo-shim/Promise';
import WeakMap from 'dojo-shim/WeakMap';
import { createProjector, Projector } from 'dojo-widgets/projector';

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
		state.handles.set(projectorKey, {
			destroy() {
				state.projectorKeys.delete(projectorKey.value);
			}
		});
	}

	return updateProjectorChildren(registry, state, counter, projector, tree.append)
		.then(() => {
			projector.attach();
		});
}

function updateProjectorChildren(
	registry: ReadOnlyRegistry,
	state: RenderState,
	counter: Counter,
	projector: Projector,
	append: SceneWidget[]
): Promise<void> {
	return Promise.all(
		append.map(({ widget: id }) => registry.getWidget(id))
	).then((widgets) => {
		for (const widget of widgets) {
			const { id } = widget;
			const key = state.widgetKeys.get(id) || { value: id };
			if (!state.widgetKeys.has(id)) {
				state.widgetKeys.set(id, key);
			}

			// TODO: Implement diffing…
			state.widgets.set(key, widget);
			const handle = projector.append(widget);
			state.handles.set(key, {
				destroy() {
					handle.destroy();
					state.widgetKeys.delete(key.value);
				}
			});
		}
	});
}
