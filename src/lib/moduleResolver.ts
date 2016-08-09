import Promise from 'dojo-shim/Promise';

/**
 * Internal interface to asynchronously resolve a module by its identifier.
 */
export interface ResolveMid {
	(mid: string): Promise<any>;
}

/**
 * Function that maps a (relative) module identifier to an absolute one.
 */
export interface ToAbsMid {
	(moduleId: string): string;
}

export default function makeResolver(toAbsMid: ToAbsMid): ResolveMid {
	return function resolveMid(mid: string): Promise<any> {
		return new Promise((resolve) => {
			// Assumes require() is an AMD loader!
			require([toAbsMid(mid)], (module) => {
				if (module.__esModule) {
					resolve(module.default);
				}
				else {
					resolve(module);
				}
			});
		});
	};
}
