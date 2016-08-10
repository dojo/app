import global from 'dojo-core/global';
import has from 'dojo-core/has';
import { Handle } from 'dojo-core/interfaces';

export default function stubDom(): Handle {
	if (has('host-node')) {
		global.document = (<any> require('jsdom')).jsdom('<html><body></body></html>');
		global.Node = global.document.defaultView.Node;

		return {
			destroy() {
				delete global.document;
				delete global.Node;
			}
		};
	}
	else {
		return { destroy() {} };
	}
}
