import { remove } from 'dojo-dom/dom';
import { from as arrayFrom } from 'dojo-shim/array';
import Promise from 'dojo-shim/Promise';

import {
	ActionDefinition,
	ActionFactory,
	ActionLike,
	StoreDefinition,
	StoreFactory,
	StoreLike
} from '../createApp';
import { RESOLVE_CONTENTS, ResolveMid } from './moduleResolver';
import parseJsonAttribute from './parseJsonAttribute';

interface BaseTask {
	element: Element;
}

interface JsonObject {
	[key: string]: any;
}

interface ActionTask extends BaseTask {
	factory?: string;
	from?: string;
	id: string;
	importName: string;
	state?: JsonObject;
	stateFrom?: string;
	type: 'action';
}

interface MultipleActionsTask extends BaseTask {
	from: string;
	type: 'multiple-actions';
}

interface StoreTask extends BaseTask {
	default?: 'action' | 'widget';
	factory: string;
	from?: string;
	id: string;
	importName: string;
	options?: JsonObject;
	type: 'store';
}

type Task = ActionTask | MultipleActionsTask | StoreTask;

const parsers = Object.create(null, {
	'app-action': {
		value(element: Element): ActionTask {
			let id = element.getAttribute('data-uid') || element.getAttribute('id');
			const factory = element.getAttribute('data-factory');
			const from = element.getAttribute('data-from');
			const importName = element.getAttribute('data-import');
			const stateFrom = element.getAttribute('data-state-from');
			const stateJson = element.getAttribute('data-state');

			if (factory && !id) {
				throw new Error('app-action requires data-uid or id attribute if data-factory is given');
			}
			if (!factory && !from) {
				throw new Error('app-action requires data-from attribute if data-factory is not given');
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
					id = from.split('/').pop();
				}
			}

			if (!id) {
				throw new Error(`Could not determine ID for app-action (from=${from} and import=${importName})`);
			}

			const state = stateJson ? parseJsonAttribute<JsonObject>('data-state', stateJson) : null;

			return {
				element,
				factory,
				from,
				id,
				importName,
				state,
				stateFrom,
				type: 'action'
			};
		}
	},

	'app-actions': {
		value(element: Element): MultipleActionsTask {
			const from = element.getAttribute('data-from');
			if (!from) {
				throw new Error('app-actions requires data-from attribute');
			}

			return {
				element,
				from,
				type: 'multiple-actions'
			};
		}
	},

	'app-store': {
		value(element: Element): StoreTask {
			let id = element.getAttribute('data-uid') || element.getAttribute('id');
			const factory = element.getAttribute('data-factory');
			const from = element.getAttribute('data-from');
			const importName = element.getAttribute('data-import');
			const type = element.getAttribute('data-type');
			const optionsJson = element.getAttribute('data-options');

			if (factory && !id && !type) {
				throw new Error('app-store requires data-uid, id or data-type attribute if data-factory is given');
			}
			if (!factory && !from) {
				throw new Error('app-store requires data-from attribute if data-factory is not given');
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
					id = from.split('/').pop();
				}
			}

			if (!type && !id) {
				throw new Error(`Could not determine ID for app-store (from=${from} and import=${importName})`);
			}

			const options = optionsJson ? parseJsonAttribute<JsonObject>('data-options', optionsJson) : null;

			return {
				default: <'action' | 'widget'> type,
				factory,
				from,
				id,
				importName,
				element,
				options,
				type: 'store'
			};
		}
	}
});

function getRegistrationTasks(root: Element): Task[] {
	const allElements: Element[] = arrayFrom(root.getElementsByTagName('*'));
	allElements.unshift(root); // Be inclusive!

	const tasks: Task[] = [];
	for (const element of allElements) {
		let name: string;

		const tagName = element.tagName.toLowerCase();
		if (parsers[tagName]) {
			name = tagName;
		}
		else {
			const attrIs = (element.getAttribute('is') || '').toLowerCase();
			if (parsers[attrIs]) {
				name = attrIs;
			}
		}

		if (name) {
			tasks.push(parsers[name](element));
		}
	}

	return tasks;
}

function createActionDefinition(
	resolveMid: ResolveMid,
	{
		factory,
		from,
		id,
		importName,
		state,
		stateFrom
	}: ActionTask
): ActionDefinition {
	return {
		id,
		factory(options) {
			if (factory) {
				return resolveMid<ActionFactory>(factory).then((factory) => {
					return factory(options);
				});
			}
			else {
				return resolveMid<ActionLike>(from, importName || 'default');
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

function createStoreDefinition(
	resolveMid: ResolveMid,
	{
		factory,
		from,
		id,
		importName,
		options
	}: StoreTask
): StoreDefinition {
	return {
		id,
		factory(options: any) {
			if (factory) {
				return resolveMid<StoreFactory>(factory).then((factory) => {
					return factory(options);
				});
			}
			else {
				return resolveMid<StoreLike>(from, importName || 'default');
			}
		},
		options
	};
}

export interface Result {
	actions: ActionDefinition[];
	defaultStores: { type: 'action' | 'widget', definition: StoreDefinition }[];
	stores: StoreDefinition[];
}

export default function extractRegistrationElements(resolveMid: ResolveMid, root: Element): Promise<Result> {
	return new Promise((resolve, reject) => {
		const result: Result = {
			actions: [],
			defaultStores: [],
			stores: []
		};
		const promises: Promise<void>[] = [];

		for (const task of getRegistrationTasks(root)) {
			switch (task.type) {
				case 'action':
					result.actions.push(createActionDefinition(resolveMid, <ActionTask> task));
					break;

				case 'multiple-actions': {
					const promise = loadMultipleActions(resolveMid, <MultipleActionsTask> task).then((actions) => {
						result.actions.push(...actions);
					});
					promises.push(promise);
					break;
				}

				case 'store': {
					const { default: type } = <StoreTask> task;
					const definition = createStoreDefinition(resolveMid, <StoreTask> task);
					if (type) {
						result.defaultStores.push({ type, definition });
					}
					else {
						result.stores.push(definition);
					}
					break;
				}
			}

			remove(task.element);
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
