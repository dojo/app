import Promise from 'dojo-shim/Promise';
import Symbol from 'dojo-shim/Symbol';

/**
 * Internal interface to asynchronously resolve a module by its identifier.
 */
export interface ResolveMid {
	<T>(mid: string, member?: string | symbol): Promise<T>;
}

/**
 * Function that maps a (relative) module identifier to an absolute one.
 */
export interface ToAbsMid {
	(moduleId: string): string;
}

export const RESOLVE_CONTENTS = Symbol();

export default function makeResolver(toAbsMid: ToAbsMid): ResolveMid {
	return function resolveMid<T>(mid: string, member: string | symbol = 'default'): Promise<T> {
		return new Promise((resolve) => {
			// Assumes require() is an AMD loader!
			require([toAbsMid(mid)], resolve);
		}).then((module: any) => {
			if (member === 'default') {
				return module.__esModule ? module.default : module;
			}
			else if (member === RESOLVE_CONTENTS) {
				const contents: { [member: string]: any } = {};
				for (const member of Object.keys(module)) {
					if (member !== '__esModule' && member !== 'default') {
						contents[member] = module[member];
					}
				}
				return contents;
			}
			else {
				return module[member];
			}
		});
	};
}
