import * as assert from 'intern/chai!assert';

import {
	ActionLike,
	StoreLike,
	WidgetLike
} from 'src/createApp';

export function createAction(): ActionLike {
	return <ActionLike> {
		configure (configuration: Object) {}
	};
}

export function createStore(): StoreLike {
	return <StoreLike> {};
}

export function createWidget(): WidgetLike {
	return <WidgetLike> {};
}

export function invert(promise: Promise<any>): Promise<any> {
	return promise.then((value) => {
		throw value;
	}, (err) => {
		return err;
	});
}

export function rejects(promise: Promise<any>, errType: Function, msg?: string): Promise<any> {
	return promise.then(() => {
		throw new Error('Promise should have rejected');
	}, (err: any) => {
		assert.throws(() => { throw err; }, errType);
		if (msg) {
			assert.strictEqual(err.message, msg);
		}
		return err;
	});
}

export function strictEqual(promise: Promise<any>, expected: any): Promise<void> {
	return promise.then((actual: any) => {
		assert.strictEqual(actual, expected);
	});
}
