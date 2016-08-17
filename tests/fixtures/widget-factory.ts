import { WidgetFactory } from 'src/createApp';

let factory: WidgetFactory = null;

export function stub (stub: WidgetFactory) {
	factory = stub;
}

export default (function (options) {
	return factory(options);
} as WidgetFactory);
