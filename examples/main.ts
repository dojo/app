import createWidget from 'dojo-widgets/createWidget';

import createApp from '../src/createApp';

const app = createApp();

app.registerWidget('foo', createWidget({ state: { label: 'foo' }, tagName: 'h1' }));

app.renderScene({
	// FIXME: App must be created with the root element, disallow it from changing between scenes.
	root: document.body,
	tree: {
		projector: true,
		append: [
			{
				widget: 'foo'
			}
		]
	}
});
