import Promise from 'dojo-shim/Promise';
import Symbol from 'dojo-shim/Symbol';
import { Require } from 'dojo-interfaces/loader';
declare const require: Require;
/**
 * Internal interface to asynchronously resolve a module by its identifier.
 */
export interface ResolveMid {
	/**
	 * Resolves a module export based on its identifier.
	 *
	 * @param mid The module identifier
	 * @param member If not provided the default export is returned. If the `RESOLVE_CONTENTS` symbol an object is
	 *   returned containing all non-default expors. Else returns the requested member.
	 * @return A promise for the resolved export(s). Does not reject if the module could not be loaded, or if the
	 *   requested export does not exist.
	 */
	<T>(mid: string, member?: string | symbol): Promise<T>;
}

/**
 * Function that maps a (relative) module identifier to an absolute one.
 */
export interface ToAbsMid {
	(moduleId: string): string;
}

/**
 * Special value that can be provided to the module resolver, indicating it should resolve the module contents, not
 * just a particular export.
 */
export const RESOLVE_CONTENTS = Symbol();

/**
 * Creates a module resolver.
 *
 * @param toAbsMid Function to resolve relative module identifiers
 * @return The resolver function
 */
export default function makeResolver(toAbsMid: ToAbsMid): ResolveMid {
	return function resolveMid<T>(mid: string, member: string | symbol = 'default'): Promise<T> {
		return new Promise((resolve) => {
			// Assumes require() is an AMD loader!
			require([toAbsMid(mid)], resolve);
		})
		.then((module: any) => {
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
