import { Handle } from 'dojo-core/interfaces';
import { includes } from 'dojo-shim/array';
import Map from 'dojo-shim/Map';
import Promise from 'dojo-shim/Promise';
import WeakMap from 'dojo-shim/WeakMap';
import createWidget from 'dojo-widgets/createWidget';
import { createProjector, Projector } from 'dojo-widgets/projector';
import { VNode } from 'maquette';

import {
	Identifier,
	ReadOnlyRegistry,
	WidgetLike
} from '../createApp';

export type SceneElement = SceneWidget;

export interface SceneWidget {
	widget: Identifier;
}

interface Key {
	value: string;
}

class Counter {
	private readonly prefix: string;
	private count: number;

	constructor(prefix = '') {
		this.prefix = prefix;
		this.count = 0;
	}

	incr() {
		return `${this.prefix}.${this.count++}`;
	}

	level() {
		return new Counter(`${this.prefix}.${this.count}`);
	}
}

type RenderFunction = () => VNode;

interface RenderState {
	childrenKeys: WeakMap<Key, Key[]>;
	handles: WeakMap<Key, Handle>;
	invalidate: () => void;
	rootChildren: (VNode | RenderFunction)[];
	rootKey: Key;
	rootProjector: Projector;
	widgetKeys: Map<Identifier, Key>;
	widgets: WeakMap<Key, WidgetLike>;
}

const renderState = new WeakMap<ReadOnlyRegistry, RenderState>();

export function render(registry: ReadOnlyRegistry, root: Element, nodes: SceneElement[]) {
	const state = renderState.get(registry) || initialize(root);
	if (!renderState.has(registry)) {
		renderState.set(registry, state);
	}

	return update(registry, state, new Counter(), nodes)
		.then(() => {
			return {
				destroy() {
					state.widgetKeys.forEach((key) => {
						if (state.handles.has(key)) {
							state.handles.get(key).destroy();
						}
					});
					state.rootProjector.destroy();
				}
			};
		});
}

function initialize(root: Element) {
	const rootProjector = createProjector({ autoAttach: true, root });
	const rootKey = { value: 'root' };
	const childrenKeys = new WeakMap<Key, Key[]>();
	childrenKeys.set(rootKey, []);

	const proxy = createWidget.extend({
		getChildrenNodes() {
			return state.rootChildren.map(function (nodeOrRender) {
				if (typeof nodeOrRender === 'function') {
					return nodeOrRender();
				}
				return nodeOrRender;
			});
		}
	})({ tagName: 'div' });
	rootProjector.append(proxy);

	const state = {
		childrenKeys,
		handles: new WeakMap<Key, Handle>(),
		invalidate: proxy.invalidate.bind(proxy),
		rootChildren: [],
		rootKey,
		rootProjector,
		widgetKeys: new Map<Identifier, Key>(),
		widgets: new WeakMap<Key, WidgetLike>()
	};

	return state;
}

function update(
	registry: ReadOnlyRegistry,
	state: RenderState,
	counter: Counter,
	nodes: SceneElement[]
): Promise<void> {
	return updateWidgets(registry, state, state.rootKey, counter.level(), nodes)
		.then((widgets) => {
			state.rootChildren = widgets.map((widget) => {
				return widget.render.bind(widget);
			});

			state.invalidate();
		});
}

function updateWidgets(
	registry: ReadOnlyRegistry,
	state: RenderState,
	parentKey: Key,
	counter: Counter,
	append: SceneWidget[]
): Promise<WidgetLike[]> {
	interface Child {
		key: Key;
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
			const previousKeys = state.childrenKeys.get(parentKey);
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

			return children.map(({ widget }) => widget);
		});
}
