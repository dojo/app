import { from as arrayFrom } from 'dojo-core/array';
import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-core/Promise';
import Set from 'dojo-core/Set';
import Map from 'dojo-core/Map';
import { place, Position } from 'dojo-dom/dom';
import { createProjector, Projector } from 'dojo-widgets/projector';
import { ParentListMixin } from 'dojo-widgets/mixins/createParentListMixin';

import {
	CombinedRegistry,
	WidgetFactory,
	WidgetLike
} from './createApp';
import resolveListenersMap from './_resolveListenersMap';

export interface RealizationHandle extends Handle {
	/**
	 * Get a realized widget with the given ID.
	 * @return The widget, or `null` if no such widget exists
	 */
	getWidget(id: string): WidgetLike;
}

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
	stateFrom?: any;
}

function resolveOptions(registry: CombinedRegistry, element: Element, idFromAttributes: string): Options | Promise<Options> {
	const str = element.getAttribute('data-options') || '';
	if (!str) {
		return idFromAttributes ? { id: idFromAttributes } : null;
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

const noop = () => {};

export default function realizeCustomElements(registry: CombinedRegistry, root: Element): Promise<Handle> {
	// Bottom up, breadth first queue of custom elements who's children's widgets need to be appended to
	// their own widget. Combined for all widget projectors.
	const appendQueue: CustomElement[] = [];
	// All identified widgets.
	const identifiedWidgets = new Map<string, WidgetLike>();
	// For each projector, track the immediate custom element descendants. These placeholder
	// elements will be replaced with rendered widgets.
	const immediatePlaceholderLookup = new Map<Projector, CustomElement[]>();
	// Projector instances for each widget projector.
	const projectors: Projector[] = [];
	// Widgets that are created during realization (not registered instances).
	const managedWidgets: WidgetLike[] = [];

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
							resolveOptions(registry, custom.element, id)
						]).then(([factory, options]) => {
							const f = <WidgetFactory> factory;
							if (options) {
								id = options.id;
								return f(options);
							}
							else {
								return f();
							}
						});
					}

					loadedWidgets.push(promise.then((widget) => {
						// Ensure identified widgets are unique.
						if (id !== undefined) {
							if (identifiedWidgets.has(id)) {
								throw new Error(`A widget with ID '${id}' already exists`);
							}
							identifiedWidgets.set(id, widget);
						}

						// Store the widget for easy access.
						custom.widget = widget;

						// Widget instances come straight from the registry, but the other widgets were created
						// whilst realizing the custom elements. These should be managed.
						if (!isWidgetInstance) {
							managedWidgets.push(widget);
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
		const uniques = new Set(widgets);
		if (uniques.size !== widgets.length) {
			throw new Error('Cannot attach a widget multiple times');
		}
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
			},

			getWidget(id: string) {
				return identifiedWidgets.get(id) || null;
			}
		};
	});
};
