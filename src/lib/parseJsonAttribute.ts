export default function parseJsonAttribute<O extends Object>(name: string, value: string): O {
	let object: O;
	try {
		object = JSON.parse(value);
	} catch (err) {
		throw new SyntaxError(`Invalid ${name}: ${err.message} (in ${JSON.stringify(value)})`);
	}
	if (!object || typeof object !== 'object') {
		throw new TypeError(`Expected object from ${name} (in ${JSON.stringify(value)})`);
	}
	return object;
}
