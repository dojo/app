import { Handle } from 'dojo-core/interfaces';
import { remove } from 'dojo-dom/dom';
import { includes } from 'dojo-shim/array';
import Map from 'dojo-shim/Map';
import Promise from 'dojo-shim/Promise';
import WeakMap from 'dojo-shim/WeakMap';
import { Parent as WidgetParent } from 'dojo-widgets/mixins/interfaces';
import { List } from 'immutable';
import { createProjector, h, Projector, VNode } from 'maquette';

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

class AdoptiveWidgetParent implements WidgetParent {
	private readonly invalidateFn: () => void;

	constructor(invalidateFn: () => void) {
		this.invalidateFn = invalidateFn;
	}

	append(ignore: any): Handle {
		return { destroy() {} };
	}

	get children() {
		return List();
	}

	set children(ignore: any) {}

	invalidate() {
		this.invalidateFn();
	}
}

type FlatVNodeChildren = (string | VNode)[];

interface AttachedWidget {
	vnode?: VNode;
	boundRender(): VNode;
}

interface RenderState {
	attachedWidgets: Map<Key, AttachedWidget>;
	counter: Counter;
	handles: WeakMap<Key, Handle>;
	placeholderCache: WeakMap<Key, VNode>;
	projector: Projector;
	pruneOnUpdate: { vnode: VNode; domNode: Node; }[];
	rootElement: Element;
	rootRender?: () => VNode;
	rootVNodes: FlatVNodeChildren;
	widgetCache: WeakMap<Key, WidgetLike>;
	widgetKeys: Map<Identifier, Key>;
	widgetParent: AdoptiveWidgetParent;
}

const renderState = new WeakMap<ReadOnlyRegistry, RenderState>();

export function render(registry: ReadOnlyRegistry, root: Element, nodes: RootNodes) {
	const state = renderState.get(registry) || initialize(root);
	const isInitial = !renderState.has(registry);
	if (isInitial) {
		renderState.set(registry, state);
	}

	return update(registry, state, nodes)
		.then(() => {
			if (isInitial) {
				const properties = {
					afterUpdate() {
						for (const { vnode, domNode } of state.pruneOnUpdate) {
							if (vnode.domNode !== domNode) {
								remove(domNode);
							}
						}
						state.pruneOnUpdate = [];
					}
				};
				state.rootRender = () => h('div', properties, state.rootVNodes);
				state.projector.merge(state.rootElement, state.rootRender);
			}
			else {
				state.projector.scheduleRender();
			}

			return {
				destroy() {
					renderState.delete(registry);

					state.projector.stop();
					state.projector.detach(state.rootRender!);

					state.widgetKeys.forEach((key) => {
						const handle = state.handles.get(key);
						if (handle) {
							handle.destroy();
						}
					});

					// FIXME: Should pruneOnUpdate be processed here?
				}
			};
		});
}

function initialize(rootElement: Element): RenderState {
	const projector = createProjector();
	const counter = new Counter();
	const widgetParent = new AdoptiveWidgetParent(() => projector.scheduleRender());

	return {
		attachedWidgets: new Map<Key, AttachedWidget>(),
		counter,
		handles: new WeakMap<Key, Handle>(),
		placeholderCache: new WeakMap<Key, VNode>(),
		projector,
		pruneOnUpdate: [],
		rootElement,
		rootVNodes: [],
		widgetCache: new WeakMap<Key, WidgetLike>(),
		widgetKeys: new Map<Identifier, Key>(),
		widgetParent
	};
}

function update(
	registry: ReadOnlyRegistry,
	state: RenderState,
	nodes: RootNodes
): Promise<void> {
	const counter = state.counter.level();

	const currentWidgetKeys: Key[] = [];
	const promises: Promise<void>[] = [];
	const rootVNodes: VNode[] = [];

	type Processing = [ FlatVNodeChildren, Counter, SceneNode[] ];
	const processing: Processing[] = [ [ rootVNodes, counter, nodes ] ];
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

				const placeholder = state.placeholderCache.get(key) || h('div', {
					afterCreate: afterPlaceholderCreate,
					key: {
						fn(element: Element) {
							const existing = state.attachedWidgets.get(key);
							if (existing) {
								const { boundRender, vnode } = existing;
								state.projector.detach(boundRender);
								// The widget may be moved to a different place entirely, in which case Maquette won't
								// update the current domNode. It has to be removed manually, so prepare for that.
								if (vnode && vnode.domNode) {
									state.pruneOnUpdate.push({ vnode, domNode: vnode.domNode });
								}
							}

							const widget = state.widgetCache.get(key);
							const attached: AttachedWidget = {
								boundRender(): VNode {
									attached.vnode = widget.render();
									return attached.vnode;
								}
							};
							state.attachedWidgets.set(key, attached);
							state.projector.replace(element, attached.boundRender);
						}
					}
				});
				if (!state.placeholderCache.has(key)) {
					state.placeholderCache.set(key, placeholder);
				}

				siblings.push(placeholder);
				currentWidgetKeys.push(key);

				if (!state.widgetCache.has(key)) {
					const promise = registry.getWidget(value).then((widget) => {
						state.widgetCache.set(key, widget);
						state.handles.set(key, {
							destroy() {
								widget.destroy();
								state.widgetKeys.delete(key.value);

								const attached = state.attachedWidgets.get(key);
								if (attached) {
									state.projector.detach(attached.boundRender);
									state.attachedWidgets.delete(key);
								}
							}
						});

						// Ensures a render is scheduled when the widget is invalidated.
						widget.parent = state.widgetParent;
					});
					promises.push(promise);
				}
			}
			else if (isSceneElement(node)) {
				counter.incr();
				// FIXME: Reuse previous key if (for the same value) it describes a VNode with the same tagName and
				// properties.
				const { key } = counter;

				const vnode = h(node.tagName, { key });
				siblings.push(vnode);

				if (node.children) {
					processing.push([ vnode.children!, counter.level(), node.children ]);
				}
			}
			else {
				counter.incr();
				// FIXME: Reuse previous key if (for the same value) it describes a VNode with the same text value.
				const { key } = counter;

				const vnode = h('', { key }, node);
				siblings.push(vnode);
			}
		}
	}

	return Promise.all(promises)
		.then(() => {
			state.widgetKeys.forEach((key) => {
				if (!includes(currentWidgetKeys, key)) {
					// TODO: It follows that any registered widget instances should override their destroy() method, as
					// destruction would prevent them from being reused. Alternatively we could communicate
					// destroyability through the registry.
					//
					// Also, upon destruction factories should revert to creating a new instance. And if a factory
					// always returns the same instance then the above applies.
					const handle = state.handles.get(key);
					if (handle) {
						handle.destroy();
					}
				}
			});

			state.rootVNodes = rootVNodes;
		});
}

interface PlaceholderProperties {
	key: { fn: (element: Element) => void };
}
function afterPlaceholderCreate(element: Element, _: any, __: any, props: PlaceholderProperties) {
	props.key.fn(element);
}
