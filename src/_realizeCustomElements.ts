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
	WidgetLike
} from './createApp';

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

function isCustomElement(name: string): boolean {
	return name === 'widget-projector' || name === 'widget-instance';
}

function getCustomElementsByWidgetProjector(root: Element): CustomElement[] {
	const allElements: Element[] = arrayFrom(root.getElementsByTagName('*'));
	allElements.unshift(root); // Be inclusive!

	const customElements: CustomElement[] = [];
	for (const element of allElements) {
		let name: string;

		const tagName = normalizeName(element.tagName);
		if (isCustomElement(tagName)) {
			name = tagName;
		}
		else {
			const attrIs = normalizeName(element.getAttribute('is') || '');
			if (attrIs !== '' && isCustomElement(attrIs)) {
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

function resolveWidgetInstance(registry: CombinedRegistry, element: Element): Promise<WidgetLike> {
	// Resolve the widget instance ID. The `data-widget-id` attribute takes precedence over `id`.
	const attrWidgetId = element.getAttribute('data-widget-id');
	const attrId = element.getAttribute('id');
	const id = attrWidgetId || attrId;
	if (!id) {
		throw new Error('Cannot resolve widget for a custom element without \'data-widget-id\' or \'id\' attributes');
	}

	return registry.getWidget(id);
}

const noop = () => {};

export default function realizeCustomElements(registry: CombinedRegistry, root: Element): Promise<Handle> {
	// Bottom up, breadth first queue of custom elements who's children's widgets need to be appended to
	// their own widget. Combined for all widget projectors.
	const appendQueue: CustomElement[] = [];
	// For each projector, track the immediate custom element descendants. These placeholder
	// elements will be replaced with rendered widgets.
	const immediatePlaceholderLookup = new Map<Projector, CustomElement[]>();
	// Projector instances for each widget projector.
	const projectors: Projector[] = [];

	// Return a new promise here so API errors can be thrown in the executor, while still resulting in a
	// promise rejection.
	return new Promise<WidgetLike[]>((resolve) => {
		// Flat list of all widgets that are being loaded.
		const loadedWidgets: Promise<WidgetLike>[] = [];

		const widgetProjectors = getCustomElementsByWidgetProjector(root);
		for (const { children, element: root } of widgetProjectors) {
			const projector = createProjector({ root });
			immediatePlaceholderLookup.set(projector, children);
			projectors.push(projector);

			// Recursion-free, depth first processing of the tree.
			let processing = [children];
			while (processing.length > 0) {
				for (const custom of processing.shift()) {
					// TODO: This currently assumes `is === 'widget-instance'`
					const promise = resolveWidgetInstance(registry, custom.element).then((widget) => {
						// Store the widget for easy access.
						return custom.widget = widget;
					});
					loadedWidgets.push(promise);

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
				// TODO: Instances from the registry should *not* be destroyed when the returned handle is
				// destroyed, however instances created on the fly from tag registries *should* be.
			}
		};
	});
};
