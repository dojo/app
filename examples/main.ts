import global from 'dojo-core/global';
import createWidget from 'dojo-widgets/createWidget';

import createApp from '../src/createApp';

const app = createApp();

app.registerWidget('foo', createWidget({ state: { label: 'foo' }, tagName: 'h1' }));
app.registerWidget('bar', createWidget({ state: { label: 'bar' }, tagName: 'h1' }));
app.registerWidget('baz', createWidget({ state: { label: 'baz' }, tagName: 'h1' }));

global.renderFoo = () => {
	app.renderScene({
		// FIXME: App must be created with the root element, disallow it from changing between scenes.
		root: document.body,
		nodes: [
			{
				tagName: 'ul',
				children: [
					{
						tagName: 'li',
						children: [
							{
								widget: 'foo'
							}
						]
					},
					{
						tagName: 'li',
						children: [ '⬆️ should be foo' ]
					}
				]
			},
			{
				widget: 'baz'
			}
		]
	});
};

global.renderBar = () => {
	app.renderScene({
		root: document.body,
		nodes: [
			{
				tagName: 'ol',
				children: [
					{
						tagName: 'li',
						children: [
							{
								widget: 'bar'
							}
						]
					},
					{
						tagName: 'li',
						children: [ '⬆️ should be bar' ]
					}
				]
			},
			{
				widget: 'baz'
			}
		]
	});
};

global.renderFoo();
