import { ActionFactory } from 'src/createApp';

let factory: ActionFactory = null;

export function stub (stub: ActionFactory) {
	factory = stub;
}

export default (function (options) {
	return factory(options);
} as ActionFactory);
