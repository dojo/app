import { WidgetFactory } from 'src/App';

let factory: WidgetFactory = null;

export function stub (stub: WidgetFactory) {
	factory = stub;
}

export default function (options: Object) {
	return factory(options);
}
