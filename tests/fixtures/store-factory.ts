import { StoreFactory } from 'src/createApp';

let factory: StoreFactory;

export function stub (stub: StoreFactory) {
	factory = stub;
}

export default function (options: Object) {
	return factory(options);
}
