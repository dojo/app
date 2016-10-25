import { Handle } from 'dojo-core/interfaces';
import { includes } from 'dojo-shim/array';
import Map from 'dojo-shim/Map';
import Promise from 'dojo-shim/Promise';
import WeakMap from 'dojo-shim/WeakMap';
import createWidget from 'dojo-widgets/createWidget';
import { createProjector, Projector } from 'dojo-widgets/projector';
import { List } from 'immutable';
import { h, VNode } from 'maquette';

import {
	Identifier,
	ReadOnlyRegistry,
	WidgetLike
} from '../createApp';

export type SceneNode = SceneElement | SceneText | SceneWidget;
export type RootNodes = (SceneElement | SceneWidget)[];

export interface SceneElement {
	tagName: string;
	children?: SceneNode[];
}
function isSceneElement(node: any): node is SceneElement {
	return typeof node === 'object' && 'tagName' in node;
}

export type SceneText = string;

export interface SceneWidget {
	widget: Identifier;
}
function isSceneWidget(node: any): node is SceneWidget {
	return typeof node === 'object' && 'widget' in node;
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
		this.count++;
	}

	get key(): Key {
		return { value: this.value };
	}

	level() {
		return new Counter(this.value);
	}

	get value() {
		return `${this.prefix}.${this.count}`;
	}
}

type FlatVNodeChildren = (string | VNode)[];

interface WidgetInVNode {
	index: number;
	siblings: FlatVNodeChildren;
	widget: WidgetLike;
}

interface RenderState {
	childrenKeys: WeakMap<Key, Key[]>;
	counter: Counter;
	handles: WeakMap<Key, Handle>;
	invalidate: () => void;
	rootVNodes: FlatVNodeChildren;
	rootKey: Key;
	rootProjector: Projector;
	unrenderedWidgetsInVNodes: WidgetInVNode[];
	vNodes: WeakMap<Key, VNode>;
	widgetKeys: Map<Identifier, Key>;
	widgets: WeakMap<Key, WidgetLike>;
}

const renderState = new WeakMap<ReadOnlyRegistry, RenderState>();

export function render(registry: ReadOnlyRegistry, root: Element, nodes: RootNodes) {
	const state = renderState.get(registry) || initialize(root);
	if (!renderState.has(registry)) {
		renderState.set(registry, state);
	}

	return update(registry, state, nodes)
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
	const counter = new Counter();
	const { key: rootKey } = counter;
	const childrenKeys = new WeakMap<Key, Key[]>();
	childrenKeys.set(rootKey, []);

	const proxy = createWidget.extend({
		getChildrenNodes() {
			for (const { index, siblings, widget } of state.unrenderedWidgetsInVNodes) {
				siblings[index] = widget.render();
			}
			state.unrenderedWidgetsInVNodes = [];
			return state.rootVNodes;
		}
	})({ tagName: 'div' });
	rootProjector.append(proxy);

	const state: RenderState = {
		childrenKeys,
		counter,
		handles: new WeakMap<Key, Handle>(),
		invalidate: proxy.invalidate.bind(proxy),
		rootVNodes: [],
		rootKey,
		rootProjector,
		unrenderedWidgetsInVNodes: [],
		vNodes: new WeakMap<Key, VNode>(),
		widgetKeys: new Map<Identifier, Key>(),
		widgets: new WeakMap<Key, WidgetLike>()
	};

	return state;
}

function update(
	registry: ReadOnlyRegistry,
	state: RenderState,
	nodes: RootNodes
): Promise<void> {
	const counter = state.counter.level();

	const currentWidgetKeys: Key[] = [];
	const newWidgetsInVNodes: WidgetInVNode[] = [];
	const promises: Promise<void>[] = [];
	const rootVNodes: FlatVNodeChildren = [];

	const processing: [ FlatVNodeChildren, Counter, SceneNode[] ][] = [ [ rootVNodes, counter, nodes ] ];
	while (true) {
		const next = processing.shift();
		if (!next) {
			break;
		}

		const [ siblings, counter, nodes ] = next;
		for (const node of nodes) {
			if (isSceneWidget(node)) {
				const { widget: value } = node;
				const key = state.widgetKeys.get(value) || { value };
				if (!state.widgetKeys.has(value)) {
					state.widgetKeys.set(value, key);
				}

				// TODO: Support nested children?

				currentWidgetKeys.push(key);
				const index = siblings.push('') - 1;
				const widget = state.widgets.get(key);
				if (widget) {
					newWidgetsInVNodes.push({ index, siblings, widget });
				}
				else {
					const promise = registry.getWidget(value).then((widget) => {
						state.widgets.set(key, widget);
						state.handles.set(key, {
							destroy() {
								widget.destroy();
								state.widgetKeys.delete(key.value);
							}
						});

						newWidgetsInVNodes.push({ index, siblings, widget });
					});
					promises.push(promise);
				}
			}
			else if (isSceneElement(node)) {
				counter.incr();
				// TODO: Compare against previous VNode to avoid rerendering, but need to take into account children
				// const { key } = counter;

				const vNode = h(node.tagName);
				siblings.push(vNode);
				if (node.children) {
					processing.push([ vNode.children!, counter.level(), node.children ]);
				}
			}
			else {
				const vNode = h('', node);
				siblings.push(vNode);
			}
		}
	}

	return Promise.all(promises).then(() => {
			state.rootVNodes = rootVNodes;
			state.unrenderedWidgetsInVNodes = newWidgetsInVNodes;
			state.invalidate();

			// TODO: Destroy after render, not before, especially given the asynchronous promise chains and render
			// scheduling.
			state.widgetKeys.forEach((key) => {
				if (!includes(currentWidgetKeys, key)) {
					// TODO: It follows that any registered widget instances should override their destroy() method, as
					// destruction would prevent them from being reused. Alternatively we could communicate
					// destroyability through the registry.
					//
					// Also, upon destruction factories should revert to creating a new instance. And if a factory
					// always returns the same instance then the above applies.
					state.handles.get(key).destroy();
				}
			});
		});
}
