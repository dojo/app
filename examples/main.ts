import global from 'dojo-core/global';
import createMemoryStore from 'dojo-stores/createMemoryStore';
import createWidget from 'dojo-widgets/createWidget';

import createApp from '../src/createApp';

const defaultWidgetStore = createMemoryStore();
const app = createApp({ defaultWidgetStore });

// Widgets are destroyed when unrendered, but the app caches the factory result.
// Prevent destruction for now.
const createIndestructible = createWidget.extend({
	destroy() {}
});

app.loadDefinition({
	widgets: [
		{
			id: 'foo',
			factory: createIndestructible,
			options: { tagName: 'strong' },
			state: { label: 'foo' }
		},
		{
			id: 'bar',
			factory: createIndestructible,
			options: { tagName: 'em' },
			state: { label: 'bar' }
		},
		{
			id: 'baz',
			factory: createIndestructible,
			options: { tagName: 'del' },
			state: { label: 'baz' }
		}
	]
});

global.interval = setInterval(() => {
	const str = new Date().toLocaleTimeString();
	defaultWidgetStore.patch({ label: `foo @ ${str}` }, { id: 'foo' });
	defaultWidgetStore.patch({ label: `bar @ ${str}` }, { id: 'bar' });
	defaultWidgetStore.patch({ label: `baz @ ${str}` }, { id: 'baz' });
}, 1000);

global.app = app;

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

global.renderAll = () => {
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
								widget: 'foo'
							}
						]
					},
					{
						tagName: 'li',
						children: [ '⬆️ should be foo' ]
					},
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
					},
					{
						tagName: 'li',
						children: [
							{
								widget: 'baz'
							}
						]
					},
					{
						tagName: 'li',
						children: [ '⬆️ should be baz' ]
					}
				]
			}
		]
	});
};

global.renderFoo();
