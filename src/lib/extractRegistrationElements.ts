import { remove } from 'dojo-dom/dom';
import { from as arrayFrom } from 'dojo-shim/array';
import Promise from 'dojo-shim/Promise';
import Set from 'dojo-shim/Set';

import {
	ActionDefinition,
	ActionFactory,
	ActionLike,
	CustomElementDefinition,
	StoreDefinition,
	StoreFactory,
	StoreLike,
	WidgetDefinition,
	WidgetFactory,
	WidgetLike
} from '../createApp';
import { RESOLVE_CONTENTS, ResolveMid } from './moduleResolver';
import parseJsonAttribute from './parseJsonAttribute';

interface JsonObject {
	[key: string]: any;
}

interface BaseTask {
	readonly element: Element;
}

interface FactoryResolver {
	readonly factory: string;
}

interface ImportResolver {
	readonly from: string;
	readonly importName?: string;
}

interface ActionTask extends BaseTask {
	readonly id: string;
	readonly resolver: FactoryResolver | ImportResolver;
	readonly state?: JsonObject;
	readonly stateFrom?: string;
	readonly type: 'action';
}

interface ElementTask extends BaseTask, FactoryResolver {
	readonly name: string;
	readonly type: 'element';
}

interface MultipleActionsTask extends BaseTask {
	readonly from: string;
	readonly type: 'multiple-actions';
}

interface StoreTask extends BaseTask {
	readonly id: string;
	readonly isDefault: boolean;
	readonly options?: JsonObject;
	readonly resolver: FactoryResolver | ImportResolver;
	readonly type: 'store';
}

interface WidgetTask extends BaseTask {
	readonly id: string;
	readonly listeners?: JsonObject;
	readonly options?: JsonObject;
	readonly resolver: FactoryResolver | ImportResolver;
	readonly state?: JsonObject;
	readonly stateFrom?: string;
	readonly type: 'widget';
}

type Task = ActionTask | ElementTask | MultipleActionsTask | StoreTask | WidgetTask;

function isFactoryResolver(resolver: FactoryResolver | ImportResolver): resolver is FactoryResolver {
	return (<any> resolver).factory;
}

function get(element: Element, name: string): string | undefined {
	const value = element.getAttribute(name);
	return value === null ? undefined : value;
}

const TAG_NAMES = new Set(['app-action', 'app-actions', 'app-element', 'app-store', 'app-widget']);

const parsers = {
	action(element: Element): ActionTask {
		let id = get(element, 'data-uid') || get(element, 'id');
		const factory = get(element, 'data-factory');
		const from = get(element, 'data-from');
		const importName = get(element, 'data-import');
		const stateFrom = get(element, 'data-state-from');
		const stateJson = get(element, 'data-state');

		if (factory && !id) {
			throw new Error('app-action requires data-uid or id attribute if data-factory is given');
		}
		if (!factory && !from) {
			throw new Error('app-action requires data-from attribute if data-factory is not given');
		}
		if (factory && from) {
			throw new Error('app-action cannot be used with both data-from and data-factory attributes');
		}
		if (stateFrom && !factory) {
			throw new Error('app-action requires data-factory attribute if data-state-from is given');
		}
		if (stateJson && !factory) {
			throw new Error('app-action requires data-factory attribute if data-state is given');
		}

		if (from && !id) {
			if (importName) {
				id = importName;
			}
			else {
				id = <string> from.split('/').pop();
			}
		}

		if (!id) {
			throw new Error(`Could not determine ID for app-action (from=${from} and import=${importName})`);
		}

		const resolver = factory ? { factory } : { from: <string> from, importName };
		const state = stateJson ? parseJsonAttribute<JsonObject>('data-state', stateJson) : undefined;

		return {
			element,
			id,
			resolver,
			state,
			stateFrom,
			type: 'action'
		};
	},

	actions(element: Element): MultipleActionsTask {
		const from = get(element, 'data-from');
		if (!from) {
			throw new Error('app-actions requires data-from attribute');
		}

		return {
			element,
			from,
			type: 'multiple-actions'
		};
	},

	element(element: Element): ElementTask {
		const factory = get(element, 'data-factory');
		const name = get(element, 'data-name');

		if (!factory) {
			throw new Error('app-element requires data-factory');
		}
		if (!name) {
			throw new Error('app-element requires data-name');
		}

		return {
			element,
			factory,
			name,
			type: 'element'
		};
	},

	store(element: Element): StoreTask {
		let id = get(element, 'data-uid') || get(element, 'id');
		const factory = get(element, 'data-factory');
		const from = get(element, 'data-from');
		const importName = get(element, 'data-import');
		const type = <'action' | 'widget' | undefined> get(element, 'data-type');
		const optionsJson = get(element, 'data-options');

		if (factory && !id && !type) {
			throw new Error('app-store requires data-uid, id or data-type attribute if data-factory is given');
		}
		if (!factory && !from) {
			throw new Error('app-store requires data-from attribute if data-factory is not given');
		}
		if (factory && from) {
			throw new Error('app-store cannot be used with both data-from and data-factory attributes');
		}
		if (type && id) {
			throw new Error('data-type attribute must not be provided if app-store has data-uid or id attribute');
		}
		if (type && type !== 'action' && type !== 'widget') {
			throw new Error('data-type attribute of app-store must have a value of \'action\' or \'widget\'');
		}
		if (optionsJson && !factory) {
			throw new Error('app-store requires data-factory attribute if data-options is given');
		}

		if (from && !type && !id) {
			if (importName) {
				id = importName;
			}
			else {
				id = <string> from.split('/').pop();
			}
		}

		if (!type && !id) {
			throw new Error(`Could not determine ID for app-store (from=${from} and import=${importName})`);
		}

		const options = optionsJson ? parseJsonAttribute<JsonObject>('data-options', optionsJson) : undefined;
		const resolver = factory ? { factory } : { from: <string> from, importName };

		const isDefault = Boolean(type);
		if (isDefault) {
			id = type;
		}

		return {
			id: <string> id,
			isDefault,
			element,
			options,
			resolver,
			type: 'store'
		};
	},

	widget(element: Element): WidgetTask | null {
		let id = get(element, 'data-uid') || get(element, 'id');
		const factory = get(element, 'data-factory');
		const from = get(element, 'data-from');
		const importName = get(element, 'data-import');
		const listenersJson = get(element, 'data-listeners');
		const optionsJson = get(element, 'data-options');
		const stateFrom = get(element, 'data-state-from');
		const stateJson = get(element, 'data-state');

		if (stateFrom && !factory) {
			throw new Error('app-widget requires data-factory attribute if data-state-from is given');
		}
		if (listenersJson && !factory) {
			throw new Error('app-widget requires data-factory attribute if data-listeners is given');
		}
		if (optionsJson && !factory) {
			throw new Error('app-widget requires data-factory attribute if data-options is given');
		}
		if (stateJson && !factory) {
			throw new Error('app-widget requires data-factory attribute if data-state is given');
		}

		// Without factory or from, assume the widget has already been defined elsewhere.
		if (!factory && !from) {
			return null;
		}
		if (factory && from) {
			throw new Error('app-widget cannot be used with both data-from and data-factory attributes');
		}

		if (factory && !id) {
			throw new Error('app-widget requires data-uid or id attribute if data-factory is given');
		}

		if (from && !id) {
			if (importName) {
				id = importName;
			}
			else {
				id = from.split('/').pop();
			}
		}

		if (!id) {
			throw new Error(`Could not determine ID for app-widget (from=${from} and import=${importName})`);
		}

		const listeners = listenersJson ? parseJsonAttribute<JsonObject>('data-listeners', listenersJson) : undefined;
		const options = optionsJson ? parseJsonAttribute<JsonObject>('data-options', optionsJson) : undefined;
		const state = stateJson ? parseJsonAttribute<JsonObject>('data-state', stateJson) : undefined;

		const resolver = factory ? { factory } : { from: <string> from, importName };

		return {
			element,
			id,
			listeners,
			options,
			resolver,
			state,
			stateFrom,
			type: 'widget'
		};
	}
};

function getRegistrationTasks(root: Element): Task[] {
	const allElements: Element[] = arrayFrom(root.getElementsByTagName('*'));
	allElements.unshift(root); // Be inclusive!

	const tasks: Task[] = [];
	for (const element of allElements) {
		let name: string | undefined;

		const tagName = element.tagName.toLowerCase();
		if (TAG_NAMES.has(tagName)) {
			name = tagName;
		}
		else {
			const attrIs = (get(element, 'is') || '').toLowerCase();
			if (TAG_NAMES.has(attrIs)) {
				name = attrIs;
			}
		}

		let task: Task | null = null;
		switch (name) {
			case 'app-action':
				task = parsers.action(element);
				break;
			case 'app-actions':
				task = parsers.actions(element);
				break;
			case 'app-element':
				task = parsers.element(element);
				break;
			case 'app-store':
				task = parsers.store(element);
				break;
			case 'app-widget':
				task = parsers.widget(element);
				break;
		}
		if (task) {
			tasks.push(task);
		}
	}

	return tasks;
}

function createActionDefinition(
	resolveMid: ResolveMid,
	{
		id,
		resolver,
		state,
		stateFrom
	}: ActionTask
): ActionDefinition {
	return {
		id,
		factory(options) {
			if (isFactoryResolver(resolver)) {
				return resolveMid<ActionFactory>(resolver.factory).then((factory) => {
					return factory(options);
				});
			}
			else {
				return resolveMid<ActionLike>(resolver.from, resolver.importName || 'default');
			}
		},
		state,
		stateFrom
	};
}

function loadMultipleActions(
	resolveMid: ResolveMid,
	{ from }: MultipleActionsTask
): Promise<ActionDefinition[]> {
	return resolveMid<{ [member: string]: ActionLike }>(from, RESOLVE_CONTENTS).then((contents) => {
		return Object.keys(contents).map((member) => {
			return {
				id: member,
				instance: contents[member]
			};
		});
	});
}

function createCustomElementDefinition(
	resolveMid: ResolveMid,
	{
		factory,
		name
	}: ElementTask
): CustomElementDefinition {
	return {
		factory(options) {
			return resolveMid<WidgetFactory>(factory)
				.then((factory) => factory(options));
		},
		name
	};
}

function createStoreDefinition(
	resolveMid: ResolveMid,
	{
		id,
		options,
		resolver
	}: StoreTask
): StoreDefinition {
	return {
		id,
		factory(options: any) {
			if (isFactoryResolver(resolver)) {
				return resolveMid<StoreFactory>(resolver.factory)
					.then((factory) => factory(options));
			}
			else {
				return resolveMid<StoreLike>(resolver.from, resolver.importName || 'default');
			}
		},
		options
	};
}

function createWidgetDefinition(
	resolveMid: ResolveMid,
	{
		id,
		listeners,
		options,
		resolver,
		state,
		stateFrom
	}: WidgetTask
): WidgetDefinition {
	const factory: WidgetFactory = (options) => {
		if (isFactoryResolver(resolver)) {
			return resolveMid<WidgetFactory>(resolver.factory)
				.then((factory) => factory(options));
		}
		else {
			return resolveMid<WidgetLike>(resolver.from, resolver.importName || 'default');
		}
	};

	return {
		id,
		factory,
		listeners,
		options,
		state,
		stateFrom
	};
}

/**
 * Provides resulting definition objects that were extracted from the root element.
 */
export interface Result {
	/**
	 * Actions that should be loaded into the app.
	 */
	actions: ActionDefinition[];

	/**
	 * Custom elements that should be loaded into the app.
	 */
	customElements: CustomElementDefinition[];

	/**
	 * Default action and widget stores that should be loaded into the app.
	 *
	 * The 'action' ID indicates that the definition is for the default action store.
	 * The 'widget' ID indicates that the definition is for the default widget store.
	 */
	defaultStores: StoreDefinition[];

	/**
	 * Stores that should be loaded into the app.
	 */
	stores: StoreDefinition[];

	/**
	 * Widgets that should be loaded into the app.
	 */
	widgets: WidgetDefinition[];
}

/**
 * Extract action, custom element, store and widget definitions that should be loaded into the app.
 *
 * @param resolveMid Function to asynchronously resolve a module identifier
 * @param root The element within which registration elements can be found
 * @return A promise for the definition objects
 */
export default function extractRegistrationElements(resolveMid: ResolveMid, root: Element): Promise<Result> {
	return new Promise((resolve, reject) => {
		const result: Result = {
			actions: [],
			customElements: [],
			defaultStores: [],
			stores: [],
			widgets: []
		};
		const promises: Promise<void>[] = [];

		for (const task of getRegistrationTasks(root)) {
			switch (task.type) {
				case 'action':
					result.actions.push(createActionDefinition(resolveMid, <ActionTask> task));
					break;

				case 'element':
					result.customElements.push(createCustomElementDefinition(resolveMid, <ElementTask> task));
					break;

				case 'multiple-actions': {
					const promise = loadMultipleActions(resolveMid, <MultipleActionsTask> task)
						.then((actions) => {
							result.actions.push(...actions);
						});
					promises.push(promise);
					break;
				}

				case 'store': {
					const { isDefault } = <StoreTask> task;
					const definition = createStoreDefinition(resolveMid, <StoreTask> task);
					if (isDefault) {
						result.defaultStores.push(definition);
					}
					else {
						result.stores.push(definition);
					}
					break;
				}

				case 'widget':
					result.widgets.push(createWidgetDefinition(resolveMid, <WidgetTask> task));
					// Forcibly add the possibly derived ID to the element, so the <app-widget> can be realized.
					task.element.setAttribute('data-uid', (<WidgetTask> task).id);
					break;
			}

			if (task.type !== 'widget') {
				remove(task.element);
			}
		}

		if (promises.length > 0) {
			Promise.all(promises)
				.then(() => resolve(result))
				.catch(reject);
		}
		else {
			resolve(result);
		}
	});
}
