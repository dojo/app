import { WidgetFactory } from 'src/createApp';

let factory: WidgetFactory = null;

export function stub (stub: WidgetFactory) {
	factory = stub;
}

export default function (options: Object) {
	return factory(options);
}
