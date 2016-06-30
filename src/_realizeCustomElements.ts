import { from as arrayFrom } from 'dojo-shim/array';
import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-shim/Promise';
import Set from 'dojo-shim/Set';
import Map from 'dojo-shim/Map';
import { place, Position } from 'dojo-dom/dom';
import { createProjector, Projector } from 'dojo-widgets/projector';
import { ParentListMixin } from 'dojo-widgets/mixins/createParentListMixin';

import {
	CombinedRegistry,
	RegistryProvider,
	StoreLike,
	WidgetFactory,
	WidgetLike
} from './createApp';
import resolveListenersMap from './_resolveListenersMap';

const reservedNames = new Set([
	// According to <https://www.w3.org/TR/custom-elements/#valid-custom-element-name>.
	'annotation-xml',
	'color-profile',
	'font-face',
	'font-face-src',
	'font-face-uri',
	'font-face-format',
	'font-face-name',
	'missing-glyph',
	// These are reserved by this module.
	'widget-instance',
	'widget-projector'
]);

// According to <https://www.w3.org/TR/custom-elements/#valid-custom-element-name>.
export function isValidName(name: string): boolean {
	if (!/^[a-z]/.test(name)) { // Names must start with a lowercase ASCII letter
		return false;
	}

	if (name.indexOf('-') === -1) { // Names must contain at least one hyphen
		return false;
	}

	if (/[A-Z]/.test(name)) { // Names must not include uppercase ASCII letters
		return false;
	}

	if (reservedNames.has(name)) { // Reserved names must not be used.
		return false;
	}

	// Assume name does not contain other invalid characters.
	// TODO: Are the above rules sufficiently exclusive given the allowed PCENChar characters in the
	// <https://www.w3.org/TR/custom-elements/#valid-custom-element-name> specification?
	return true;
}

// <https://www.w3.org/TR/custom-elements/#look-up-a-custom-element-definition> doesn't define *how* names
// are to be compared. Additionally browsers and document modes differ in the case used for Element#tagName
// values. Lowercasing the name is the most compatible solution. This is also the approach taken by the
// Web Components polyfill:
// <https://github.com/webcomponents/webcomponentsjs/blob/251f4afedec0ce649728fa1cf22e4fc16bf2bea5/src/CustomElements/register.js#L93>
export function normalizeName(name: string): string {
	return name.toLowerCase();
}

interface CustomElement {
	children: CustomElement[];
	element: Element;
	name: string;
	widget?: WidgetLike;
}

function isCustomElement(registry: CombinedRegistry, name: string): boolean {
	return name === 'widget-projector' || name === 'widget-instance' || registry.hasCustomElementFactory(name);
}

function getCustomElementsByWidgetProjector(registry: CombinedRegistry, root: Element): CustomElement[] {
	const allElements: Element[] = arrayFrom(root.getElementsByTagName('*'));
	allElements.unshift(root); // Be inclusive!

	const customElements: CustomElement[] = [];
	for (const element of allElements) {
		let name: string;

		const tagName = normalizeName(element.tagName);
		if (isCustomElement(registry, tagName)) {
			name = tagName;
		}
		else {
			const attrIs = normalizeName(element.getAttribute('is') || '');
			if (attrIs !== '' && isCustomElement(registry, attrIs)) {
				name = attrIs;
			}
		}

		if (name) {
			customElements.push({ children: [], element, name });
		}
	}

	// A list of trees, reconstructed from the `customElements`.
	const widgetProjectors: CustomElement[] = [];
	// Inverse stack of the nodes in the current tree. The deepest node is at the start of the list.
	const inverseStack: CustomElement[] = [];

	const discardFirstNode = (element: Element) => {
		if (inverseStack.length === 0) {
			return false;
		}

		// Return `true` if the top-most element in the stack does *not* contain `element`.
		return !(inverseStack[0].element.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_CONTAINED_BY);
	};

	// `customElements` is a flat list of elements, in document order. Reconstruct a tree structure where each
	// root is assumed to be a widget projector.
	for (const custom of customElements) {
		// Remove nodes from the stack that do not contain the element.
		while (discardFirstNode(custom.element)) {
			inverseStack.shift();
		}

		// Start a new tree if the element is not contained in any existing node.
		if (inverseStack.length === 0) {
			// Don't costruct an invalid tree.
			if (custom.name !== 'widget-projector') {
				throw new Error('Custom tags must be rooted in a widget-projector');
			}

			widgetProjectors.push(custom);
		}
		// Add the element to the deepest node it is contained by.
		else {
			// Don't costruct an invalid tree.
			if (custom.name === 'widget-projector') {
				throw new Error('widget-projector cannot contain another widget-projector');
			}

			inverseStack[0].children.push(custom);
		}

		// Prepare for the next iteration.
		inverseStack.unshift(custom);
	}

	return widgetProjectors;
}

function getIdFromAttributes(element: Element): string {
	return element.getAttribute('data-widget-id') || element.getAttribute('id') || undefined;
}

interface Options {
	id?: string;
	listeners?: any;
	registryProvider: RegistryProvider;
	stateFrom?: any;
}

function resolveOptions(registry: CombinedRegistry, registryProvider: RegistryProvider, element: Element, idFromAttributes: string): Options | Promise<Options> {
	const str = element.getAttribute('data-options') || '';
	if (!str) {
		return idFromAttributes ? { id: idFromAttributes, registryProvider } : { registryProvider };
	}

	let options: Options;
	try {
		options = JSON.parse(str);
	} catch (err) {
		throw new SyntaxError(`Invalid data-options: ${err.message} (in ${JSON.stringify(str)})`);
	}
	if (!options || typeof options !== 'object') {
		throw new TypeError(`Expected object from data-options (in ${JSON.stringify(str)})`);
	}

	if ('registryProvider' in options) {
		throw new Error(`Unexpected registryProvider value in data-options (in ${JSON.stringify(str)})`);
	}
	options.registryProvider = registryProvider;

	if (!('id' in options) && idFromAttributes) {
		options.id = idFromAttributes;
	}

	const promises: Promise<void>[] = [];

	if ('stateFrom' in options) {
		const { stateFrom } = options;
		if (!stateFrom || typeof stateFrom !== 'string') {
			throw new TypeError(`Expected stateFrom value in data-options to be a non-empty string (in ${JSON.stringify(str)})`);
		}

		promises.push(registry.getStore(stateFrom).then((store) => {
			options.stateFrom = store;
		}));
	}

	if ('listeners' in options) {
		const { listeners } = options;

		let valid = true;
		if (!listeners || typeof listeners !== 'object') {
			valid = false;
		}
		else {
			// Prefer breaking a labeled loop over nesting Array#some() calls or repeating the throwing of
			// the TypeError.
			check: for (const eventType in listeners) {
				const value = listeners[eventType];
				if (Array.isArray(value)) {
					for (const identifier of value) {
						if (typeof identifier !== 'string') {
							valid = false;
							break check;
						}
					}
				}
				else if (typeof value !== 'string') {
					valid = false;
					break check;
				}
			}
		}

		if (!valid) {
			throw new TypeError(`Expected listeners value in data-options to be a widget listeners map with action identifiers (in ${JSON.stringify(str)})`);
		}

		promises.push(resolveListenersMap(registry, listeners).then((map) => {
			options.listeners = map;
		}));
	}

	if (promises.length > 0) {
		return Promise.all(promises).then(() => {
			return options;
		});
	}

	return options;
}

function resolveStateFromAttribute(registry: CombinedRegistry, element: Element): Promise<StoreLike> {
	const stateFrom = element.getAttribute('data-state-from');
	return stateFrom ? registry.getStore(stateFrom) : null;
}

function getInitialState(element: Element): Object {
	const str = element.getAttribute('data-state') || '';
	if (!str) {
		return null;
	}

	let initialState: Object;
	try {
		initialState = JSON.parse(str);
	} catch (err) {
		throw new SyntaxError(`Invalid data-state: ${err.message} (in ${JSON.stringify(str)})`);
	}
	if (!initialState || typeof initialState !== 'object') {
		throw new TypeError(`Expected object from data-state (in ${JSON.stringify(str)})`);
	}

	return initialState;
}

let idCount = 0;
function generateId(): string {
	return `custom-element-${++idCount}`;
}

const noop = () => {};

/**
 * Realizes custom elements within a root element.
 *
 * @param defaultStore The default store of the app, may be null.
 * @param registerInstance Callback for registering new widget instances with the app
 * @param registry Read-only registry of actions, custom element factories, stores and widgets
 * @param registryProvider Registry provider, to be passed to custom element factories
 * @param root The element within which custom elements are realized
 *
 * @return A handle to detach rendered widgets from the DOM and remove them from the widget registry
 */
export default function realizeCustomElements(
	defaultStore: StoreLike,
	registerInstance: (widget: WidgetLike, id: string) => Handle,
	registry: CombinedRegistry,
	registryProvider: RegistryProvider,
	root: Element
): Promise<Handle> {
	// Bottom up, breadth first queue of custom elements who's children's widgets need to be appended to
	// their own widget. Combined for all widget projectors.
	const appendQueue: CustomElement[] = [];
	// For each projector, track the immediate custom element descendants. These placeholder
	// elements will be replaced with rendered widgets.
	const immediatePlaceholderLookup = new Map<Projector, CustomElement[]>();
	// Projector instances for each widget projector.
	const projectors: Projector[] = [];
	// Widgets that are created during realization (not registered instances).
	const managedWidgets: WidgetLike[] = [];
	// Other handles that need to be cleaned up.
	const handles: Handle[] = [];

	// Return a new promise here so API errors can be thrown in the executor, while still resulting in a
	// promise rejection.
	return new Promise<WidgetLike[]>((resolve) => {
		// Flat list of all widgets that are being loaded.
		const loadedWidgets: Promise<WidgetLike>[] = [];

		const widgetProjectors = getCustomElementsByWidgetProjector(registry, root);
		for (const { children, element: root } of widgetProjectors) {
			const projector = createProjector({ root });
			immediatePlaceholderLookup.set(projector, children);
			projectors.push(projector);

			const projectorStateFrom = resolveStateFromAttribute(registry, root);

			// Recursion-free, depth first processing of the tree.
			let processing = [children];
			while (processing.length > 0) {
				for (const custom of processing.shift()) {
					const isWidgetInstance = custom.name === 'widget-instance';
					let id = getIdFromAttributes(custom.element);

					let promise: Promise<WidgetLike> = null;
					if (isWidgetInstance) {
						if (!id) {
							throw new Error('Cannot resolve widget for a custom element without \'data-widget-id\' or \'id\' attributes');
						}
						promise = registry.getWidget(id);
					}
					else {
						promise = Promise.all<any>([
							registry.getCustomElementFactory(custom.name),
							resolveOptions(registry, registryProvider, custom.element, id),
							resolveStateFromAttribute(registry, custom.element),
							projectorStateFrom
						]).then(([_factory, _options, _store, projectorStore]) => {
							const factory = <WidgetFactory> _factory;
							const options = <Options> _options;
							// `data-state-from` store of the element takes precedence, then of the projector, then
							// the application's default store.
							const store = <StoreLike> _store || projectorStore || defaultStore;

							id = options.id;
							// If the widget has an ID, but stateFrom was not in its `data-options` attribute, and
							// either its `data-state-from` attribute resolved to a store, or there is a default
							// store, set the stateFrom option to the `data-state-from` or default store.
							if (id && !options.stateFrom && store) {
								options.stateFrom = store;
							}

							if (id && options.stateFrom) {
								const initialState = getInitialState(custom.element);
								if (initialState) {
									return options.stateFrom.patch(initialState, { id }).then(() => {
										return factory(options);
									});
								}
							}

							return factory(options);
						});
					}

					loadedWidgets.push(promise.then((widget) => {
						// Store the widget for easy access.
						custom.widget = widget;

						// Widget instances come straight from the registry, but the other widgets were created
						// whilst realizing the custom elements. These should be managed.
						if (!isWidgetInstance) {
							managedWidgets.push(widget);

							// Belatedly ensure no other widget with this ID exists.
							if (id && registry.hasWidget(id)) {
								throw new Error(`A widget with ID '${id}' already exists`);
							}

							// Add the instance to the various registries the app may maintain. This requires
							// an ID, so generate one if necessary.
							// TODO: Should the widget be created with this ID? It shouldn't have a use for it…
							try {
								handles.push(registerInstance(widget, id || generateId()));
							} catch (_) {
								// registering() will throw if the widget has already been registered. Throw a
								// friendlier error message.
								throw new Error('Cannot attach a widget multiple times');
							}
						}

						return widget;
					}));

					if (custom.children.length > 0) {
						// Ensure the children are processed.
						processing.push(custom.children);
						// Ensure the children are appended to their parent.
						appendQueue.unshift(custom);
					}
				}
			}
		}

		// Wait for all widgets to be loaded in parallel.
		resolve(Promise.all(loadedWidgets));
	}).then((widgets) => {
		// Guard against improper widget usage.
		for (const widget of widgets) {
			// <any> hammer because `widget` could be anything.
			if ((<any> widget).parent) {
				throw new Error('Cannot attach a widget that already has a parent');
			}
		}

		// Build up the widget hierarchy.
		for (const custom of appendQueue) {
			// Assume the widget has the ParentListMixin.
			const parent = <WidgetLike & ParentListMixin<WidgetLike>> custom.widget;
			const widgets = custom.children.map(child => child.widget);
			parent.append(widgets);
		}

		// Attach all projectors at the same time.
		const attachedProjectors = projectors.map((projector) => {
			const immediatePlaceholders = immediatePlaceholderLookup.get(projector);
			immediatePlaceholderLookup.delete(projector);

			// Append the top-level widgets to the projector.
			projector.append(immediatePlaceholders.map(custom => custom.widget));

			// Get ready to replace the placeholder elements as soon as the widgets have rendered.
			const handle = projector.on('attach', () => {
				handle.destroy();

				const { root } = projector;
				// Rendered widgets start at this offset.
				const offset = root.childNodes.length - immediatePlaceholders.length;
				for (const { element: placeholder } of immediatePlaceholders) {
					place(root.childNodes[offset], Position.Replace, placeholder);
				}
			});

			// Now attach the projector.
			return projector.attach({ type: 'merge' });
		});

		// Wait for the projectors to be attached.
		return Promise.all(attachedProjectors);
	}).then(() => {
		return {
			destroy() {
				this.destroy = noop;
				for (const p of projectors) {
					p.destroy();
				}
				for (const w of managedWidgets) {
					w.destroy();
				}
				for (const h of handles) {
					h.destroy();
				}
			}
		};
	});
};
