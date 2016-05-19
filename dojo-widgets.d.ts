/// <reference path="./node_modules/immutable/dist/immutable.d.ts" />
/// <reference path="./node_modules/dojo-widgets/dist/typings/dojo-widgets/dojo-widgets.d.ts" />

declare module 'immutable/immutable' {
	export = Immutable;
}

declare module 'maquette/maquette' {
	export * from 'node_modules/maquette/dist/maquette';
}

declare module 'rxjs/Rx' {
	export * from 'node_modules/@reactivex/rxjs/dist/cjs/Rx';
}

declare module 'rxjs/Observable' {
	export * from 'node_modules/@reactivex/rxjs/dist/cjs/Observable';
}

declare module 'rxjs/Observer' {
	export * from 'node_modules/@reactivex/rxjs/dist/cjs/Observer';
}
