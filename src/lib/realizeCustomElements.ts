import { EventedListenersMap } from 'dojo-compose/mixins/createEvented';
import { Handle } from 'dojo-core/interfaces';
import { from as arrayFrom } from 'dojo-shim/array';
import Promise from 'dojo-shim/Promise';
import Set from 'dojo-shim/Set';
import Map from 'dojo-shim/Map';
import { place, Position } from 'dojo-dom/dom';
import { createProjector, Projector } from 'dojo-widgets/projector';

import {
	ReadOnlyRegistry,
	RegistryProvider,
	StoreLike,
	WidgetFactory,
	WidgetFactoryOptions,
	WidgetLike,
	WidgetListenersMap
} from '../createApp';
import makeIdGenerator from './makeIdGenerator';
import parseJsonAttribute from './parseJsonAttribute';
import resolveListenersMap from './resolveListenersMap';

const reservedNames = new Set([
	// According to <https://www.w3.org/TR/custom-elements/#valid-custom-element-name>.
	'annotation-xml',
	'color-profile',
	'font-face',
	'font-face-src',
	'font-face-uri',
	'font-face-format',
	'font-face-name',
	'missing-glyph'
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

	if (/^app-/.test(name)) { // Names must not start with app-
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

function isCustomElement(registry: ReadOnlyRegistry, name: string): boolean {
	return name === 'app-projector' || name === 'app-widget' || registry.hasCustomElementFactory(name);
}

function getCustomElementsByWidgetProjector(registry: ReadOnlyRegistry, root: Element): CustomElement[] {
	const allElements: Element[] = arrayFrom(root.getElementsByTagName('*'));
	allElements.unshift(root); // Be inclusive!

	const customElements: CustomElement[] = [];
	for (const element of allElements) {
		let name: string | undefined;

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
			if (custom.name !== 'app-projector') {
				throw new Error('Custom tags must be rooted in a app-projector');
			}

			widgetProjectors.push(custom);
		}
		// Add the element to the deepest node it is contained by.
		else {
			// Don't costruct an invalid tree.
			if (custom.name === 'app-projector') {
				throw new Error('app-projector cannot contain another app-projector');
			}

			inverseStack[0].children.push(custom);
		}

		// Prepare for the next iteration.
		inverseStack.unshift(custom);
	}

	return widgetProjectors;
}

function getIdFromAttributes(element: Element): string | undefined {
	return element.getAttribute('data-uid') || element.getAttribute('id') || undefined;
}

interface JsonOptions {
	id?: string;
	listeners?: any;
	stateFrom?: any;
}

interface Options {
	id?: string;
	listeners?: EventedListenersMap;
	registryProvider: RegistryProvider;
	stateFrom?: StoreLike;
}

function resolveListeners(registry: ReadOnlyRegistry, element: Element): null | Promise<EventedListenersMap> {
	const str = element.getAttribute('data-listeners');
	if (!str) {
		return null;
	}

	const listeners = parseJsonAttribute<WidgetListenersMap>('data-listeners', str);
	let valid = true;
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

	if (!valid) {
		throw new TypeError(`Expected data-listeners to be a widget listeners map with action identifiers (in ${JSON.stringify(str)})`);
	}

	return resolveListenersMap(registry, listeners);
}

function resolveOptions(registry: ReadOnlyRegistry, registryProvider: RegistryProvider, element: Element, idFromAttributes: string): Options {
	const str = element.getAttribute('data-options') || '';
	if (!str) {
		return idFromAttributes ? { id: idFromAttributes, registryProvider } : { registryProvider };
	}

	const json = parseJsonAttribute<JsonOptions>('data-options', str);
	if ('id' in json) {
		throw new Error(`Unexpected id value in data-options (in ${JSON.stringify(str)})`);
	}
	if ('listeners' in json) {
		throw new Error(`Unexpected listeners value in data-options (in ${JSON.stringify(str)})`);
	}
	if ('registryProvider' in json) {
		throw new Error(`Unexpected registryProvider value in data-options (in ${JSON.stringify(str)})`);
	}
	if ('state' in json) {
		throw new Error(`Unexpected state value in data-options (in ${JSON.stringify(str)})`);
	}
	if ('stateFrom' in json) {
		throw new Error(`Unexpected stateFrom value in data-options (in ${JSON.stringify(str)})`);
	}

	// Reassign, casted to the correct interface.
	const options = <Options> json;
	options.registryProvider = registryProvider;
	if (idFromAttributes) {
		options.id = idFromAttributes;
	}
	return options;
}

function getTransitionOptionFromProjector(element: Element): boolean {
	if (!element.hasAttribute('data-css-transitions')) {
		return false;
	}
	const value = element.getAttribute('data-css-transitions');
	return value ? value === 'true' : true;
}

function resolveStateFromAttribute(registry: ReadOnlyRegistry, element: Element): null | Promise<StoreLike> {
	const stateFrom = element.getAttribute('data-state-from');
	return stateFrom ? registry.getStore(stateFrom) : null;
}

function getInitialState(element: Element): null | Object {
	const str = element.getAttribute('data-state') || '';
	if (!str) {
		return null;
	}

	return parseJsonAttribute('data-state', str);
}

const generateId = makeIdGenerator('custom-element-');

/**
 * Realizes custom elements within a root element.
 *
 * @param defaultWidgetStore The default widget store of the app, may be null.
 * @param registerInstance Callback for registering new widget instances with the app
 * @param registry Read-only registry of actions, custom element factories, stores and widgets
 * @param registryProvider Registry provider, to be passed to custom element factories
 * @param root The element within which custom elements are realized
 *
 * @return A handle to detach rendered widgets from the DOM and remove them from the widget registry
 */
export default function realizeCustomElements(
	addIdentifier: (id: string) => Handle,
	registerInstance: (widget: WidgetLike, id: string) => Handle,
	registry: ReadOnlyRegistry,
	registryProvider: RegistryProvider,
	root: Element,
	defaultWidgetStore?: StoreLike,
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
			const cssTransitions = getTransitionOptionFromProjector(root);
			const projector = createProjector({ root, cssTransitions });
			immediatePlaceholderLookup.set(projector, children);
			projectors.push(projector);

			const projectorStateFrom = resolveStateFromAttribute(registry, root);

			// Recursion-free, depth first processing of the tree.
			let processing = [children];
			while (true) {
				const next = processing.shift();
				if (!next) {
					break;
				}

				for (const custom of next) {
					const isWidgetInstance = custom.name === 'app-widget';
					let id = getIdFromAttributes(custom.element);

					let promise: Promise<WidgetLike> = null;
					if (isWidgetInstance) {
						if (!id) {
							throw new Error('app-widget requires data-uid or id attribute');
						}
						promise = registry.getWidget(id);
					}
					else {
						promise = Promise.all<any>([
							registry.getCustomElementFactory(custom.name),
							resolveListeners(registry, custom.element),
							resolveOptions(registry, registryProvider, custom.element, id),
							resolveStateFromAttribute(registry, custom.element),
							projectorStateFrom
						]).then(([_factory, _listeners, _options, _store, projectorStore]) => {
							const factory: WidgetFactory = _factory;
							const listeners: EventedListenersMap = _listeners;
							const options: WidgetFactoryOptions = _options;
							// `data-state-from` store of the element takes precedence, then of the projector, then
							// the application's default widget store.
							const store: StoreLike = _store || projectorStore || defaultWidgetStore;

							id = options.id;

							if (listeners) {
								options.listeners = listeners;
							}

							// If the widget has an ID, and either its `data-state-from` attribute resolved to a store,
							// or there is a default store, set the stateFrom option to the `data-state-from` or default
							// widget store.
							if (id && store) {
								options.stateFrom = store;

								const initialState = getInitialState(custom.element);
								if (initialState) {
									return store.add(initialState, { id })
										// Ignore error, assume store already contains state for this widget.
										.catch(() => undefined)
										.then(() => factory(options));
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

							// Assign a presumably unique ID if necessary. It's OK for the widget to not be aware of its
							// generated ID.
							if (!id) {
								id = generateId();
							}

							// Belatedly ensure no other widget with this ID exists.
							handles.push(addIdentifier(id));

							// Add the instance to the various registries the app may maintain.
							try {
								handles.push(registerInstance(widget, id));
							} catch (_) {
								// registerInstance() will throw if the widget has already been registered. Throw a
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
			const widgets = custom.children.map(child => child.widget);
			// Assume the widget has an append() method. Don't bother typing it since it's resolved dynamically anyway.
			(<any> custom.widget).append(widgets);
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
