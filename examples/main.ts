import createWidget from 'dojo-widgets/createWidget';

import createApp from '../src/createApp';

const app = createApp();

app.registerWidget('foo', createWidget({ state: { label: 'foo' }, tagName: 'h1' }));

app.realize(document.body);
