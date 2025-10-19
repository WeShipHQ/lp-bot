---
sidebar_position: 1
title: Getting started
---
import CodeBlock from '@theme/CodeBlock';
import gettingStartedSource from '@inversifyjs/code-examples/generated/examples/v7/gettingStarted.ts.txt';

# Getting started

Start by installing `inversify` and `reflect-metadata`:

```bash
npm install inversify reflect-metadata
```

Next, initialize your first container and add some bindings:

Dependency inversion
To apply the dependency inversion principle, you can use injection symbols:

import { Container, inject, injectable, ServiceIdentifier } from 'inversify';

interface Weapon {
  damage: number;
}

const ninjaServiceId: ServiceIdentifier<Ninja> = Symbol.for('NinjaServiceId');

const weaponServiceId: ServiceIdentifier<Weapon> =
  Symbol.for('WeaponServiceId');

@injectable()
class Katana {
  public readonly damage: number = 10;
}

@injectable()
class Ninja {
  constructor(
    @inject(weaponServiceId)
    public readonly weapon: Weapon,
  ) {}
}

const container: Container = new Container();

container.bind(ninjaServiceId).to(Ninja);
container.bind(weaponServiceId).to(Katana);

const ninja: Ninja = container.get(ninjaServiceId);

console.log(ninja.weapon.damage);

By using symbols, you can provide interface implementations in a way that the dependent class is not aware of the dependency implementation details.

note
Although symbols are recommended for this purpose, InversifyJS also supports using Classes and string literals as service identifiers.


Binding
A binding represents the relationship between a service identifier and its resolution. Bindings are added to a container to configure it to provide services.

const container: Container = new Container();
container.bind<Weapon>('Weapon').to(Katana).inSingletonScope();

When the binding is added to the container, the container is configured to provide a resolved value for the service identifier Weapon by resolving the Katana class. container.bind creates a new binding with certain properties, which are explained below.

Relying on emitted class metadata
When using TypeScript, you can rely on the emitted class metadata to avoid having to manually specify the service identifier. This is done by using the @injectable decorator from inversify on the class you want to bind. You need to enable the emitDecoratorMetadata TypeScript compiler option.

export class Katana {
  public readonly damage: number = 10;
}

@injectable()
export class Samurai {
  public readonly katana: Katana;

  constructor(katana: Katana) {
    this.katana = katana;
  }
}

const container: Container = new Container();

container.bind(Katana).toSelf().inSingletonScope();
container.bind(Samurai).toSelf().inSingletonScope();

const samurai: Samurai = container.get(Samurai);

Autobinding
InversifyJS provides a feature called autobinding that allows you to automatically bind classes. Whenever a class service is being resolved and no bindings are found in the planning phase, the container adds a type binding to the requested class before proceeding with the planning phase. This feature is disabled by default. To enable it, you need to pass the autoBind option to the container or pass an autobind option when calling container.get.

export class Katana {
  public readonly damage: number = 10;
}

@injectable()
export class Samurai {
  public readonly katana: Katana;

  constructor(katana: Katana) {
    this.katana = katana;
  }
}

const container: Container = new Container();

const samurai: Samurai = container.get(Samurai, { autobind: true });

Asynchronously resolved bindings
Whenever a promise-like value is resolved from a binding, the container will wait for the promise to resolve before returning the resolved value to their dependent services:

class Katana {
  public material!: string;
  public damage!: number;
}

const dbConnectionSymbol: symbol = Symbol.for('DbConnection');
const katanaDbCollectionSymbol: symbol = Symbol.for('KatanaRepository');

const container: Container = new Container();

@injectable()
class KatanaRepository {
  readonly #dbCollection: AwesomeDbDriverCollection<Katana>;

  constructor(
    @inject(katanaDbCollectionSymbol)
    dbCollection: AwesomeDbDriverCollection<Katana>,
  ) {
    this.#dbCollection = dbCollection;
  }

  public async find(query: unknown): Promise<Katana[]> {
    return this.#dbCollection.find(query);
  }
}

container.bind(MyAwesomeEnvService).toSelf();
container
  .bind(dbConnectionSymbol)
  .toResolvedValue(
    async (
      envService: MyAwesomeEnvService,
    ): Promise<AwesomeDbDriverConnection> => {
      const databaseUrl: string = envService.getEnvironment().dbUrl;

      return AwesomeDbDriverImplementation.connect(databaseUrl);
    },
    [MyAwesomeEnvService],
  )
  .inSingletonScope();

container
  .bind(katanaDbCollectionSymbol)
  .toResolvedValue(
    (
      connection: AwesomeDbDriverConnection,
    ): AwesomeDbDriverCollection<Katana> => {
      return connection.getCollection(Katana);
    },
    [dbConnectionSymbol],
  )
  .inSingletonScope();

container.bind(KatanaRepository).toSelf();

In the example, the dbConnectionSymbol database connection is resolved asynchronously. The container waits for promises to be resolved, passing an AwesomeDbDriverConnection instance to the resolve value factory instead of a Promise<AwesomeDbDriverConnection> one.

warning
Keep in mind async bindings require the use of Container.getAsync or Container.getAllAsync to resolve any related service.

Binding properties
A binding has the following properties:

Service identifier
The identifier of the service for which a resolution is provided.

Scope
The scope determines the caching strategy used to decide whether the service should be resolved or a cached value should be provided.

Request
When the service is resolved within the same container.get request, the same resolved value will be used.

export class LegendaryWarrior {
  constructor(
    @inject('Weapon') public readonly firstWeapon: Weapon,
    @inject('Weapon') public readonly secondWeapon: Weapon,
    @inject('Weapon') public readonly thirdWeapon: Weapon,
  ) {}
}

const container: Container = new Container();
container.bind<Weapon>('Weapon').to(Katana).inRequestScope();
container.bind(LegendaryWarrior).toSelf();

const firstKatana: Weapon = container.get<Weapon>('Weapon');
const secondKatana: Weapon = container.get<Weapon>('Weapon');

const legendaryWarrior: LegendaryWarrior = container.get(LegendaryWarrior);

// Returns false
const isSameKatana: boolean = firstKatana === secondKatana;

// Returns true
const warriorHasSameKatana: boolean =
  legendaryWarrior.firstWeapon === legendaryWarrior.secondWeapon &&
  legendaryWarrior.secondWeapon === legendaryWarrior.thirdWeapon;

Singleton
When the service is resolved, the same cached resolved value will be used.

const container: Container = new Container();
container.bind<Weapon>('Weapon').to(Katana).inSingletonScope();

const firstKatana: Weapon = container.get<Weapon>('Weapon');
const secondKatana: Weapon = container.get<Weapon>('Weapon');

// Returns true
const isSameKatana: boolean = firstKatana === secondKatana;

Transient
When the service is resolved, a new resolved value will be used each time.

const container: Container = new Container();
container.bind<Weapon>('Weapon').to(Katana).inTransientScope();

const firstKatana: Weapon = container.get<Weapon>('Weapon');
const secondKatana: Weapon = container.get<Weapon>('Weapon');

// Returns false
const isSameKatana: boolean = firstKatana === secondKatana;

Constraint
Specifies whether the binding is used to provide a resolved value for the given service identifier. Refer to the API docs for more information.

Lifecycle handlers
Handlers that are called after a resolved value is provided or a singleton-scoped binding is deactivated. Refer to the API docs for more information.

DI Hierarchy
InversifyJS is a popular library for implementing inversion of control (IoC) and dependency injection (DI) in TypeScript applications. It supports hierarchical dependency injection, which can be a powerful tool in complex applications.

With InversifyJS's hierarchical injection system, you can create a hierarchy of containers where each container can have a parent container. This allows for better organization and separation of concerns in your application.

When a dependency needs to be injected, InversifyJS starts by looking in the current container for a binding. If the binding is not found, it moves up the hierarchy to the parent container and continues the search. This process continues until a binding is found or the top-level parent container is reached.

Binding overrides
Found bindings might override ancestor bindings even if their constraints are not met. For example, if a named binding is found in the child container for the requested service, that binding overrides parent bindings even if this binding is later discarded in a non-named resolution request.

DI hierarchies and cached bindings
When using hierarchical injection, be aware that cached bindings from the first resolution will be used for subsequent resolution, even if the call comes from another child container.

@injectable()
class Samurai {
  constructor(
    @inject(Katana)
    public katana: Katana,
  ) {}
}

const parentContainer: Container = new Container();
parentContainer.bind(Samurai).toSelf().inSingletonScope();
parentContainer.bind(Katana).toSelf();

const childContainer: Container = new Container({ parent: parentContainer });
childContainer.bind(Katana).to(LegendaryKatana);

// The result of this resolution will be cached in the samurai binding
childContainer.get(Samurai);

// This samurai will have a LegendaryKatana injected
const samurai: Samurai = parentContainer.get(Samurai);

If this behaviour is unwanted, consider using ContainerModule instead. This way, you can load it in both containers. Different containers will have different binding and therefore different cached values.

By using InversifyJS's hierarchical injection system, you can easily manage complex dependencies and keep your code clean and modular. It provides a flexible and scalable solution for handling dependencies in your TypeScript applications.

class Katana {}

const parentContainer: Container = new Container();
parentContainer.bind(weaponIdentifier).to(Katana);

const childContainer: Container = new Container({ parent: parentContainer });

const katana: Katana = childContainer.get(weaponIdentifier);

Chained Resolution Mode
InversifyJS supports two different resolution modes when working with container hierarchies: standard resolution and chained resolution.

Standard Resolution Mode
In standard resolution mode (the default behavior), InversifyJS follows a first-found approach:

First, it searches for bindings in the current container
If bindings are found in the current container, those bindings are used exclusively
If no bindings are found in the current container, it moves up to the parent container
This process continues until bindings are found or the top-level container is reached
This means that if a child container has any bindings for a service, the parent container's bindings for that same service will be ignored entirely:

const parentContainer: Container = new Container();

const container: Container = new Container({
  parent: parentContainer,
});

parentContainer.bind<Weapon>('Weapon').to(Katana);
container.bind<Weapon>('Weapon').to(Shuriken);

// returns Weapon[] with only a Shuriken instance
const weapons: Weapon[] = container.getAll<Weapon>('Weapon', {
  chained: false,
});

Chained Resolution Mode
Chained resolution mode allows you to collect bindings from all levels of the container hierarchy. When using getAll() or getAllAsync() with the chained: true option:

Bindings are collected from the current container
Then bindings are collected from the parent container
This continues recursively up the entire hierarchy
All collected bindings are combined and returned
This is particularly useful when you want to aggregate services from different layers of your application (e.g., core services from a parent container and feature-specific services from child containers).

const parentContainer: Container = new Container();

const container: Container = new Container({
  parent: parentContainer,
});

parentContainer.bind<Weapon>('Weapon').to(Katana);
container.bind<Weapon>('Weapon').to(Shuriken);

// returns Weapon[] with both Katana and Shuriken instances
const weapons: Weapon[] = container.getAll<Weapon>('Weapon', { chained: true });


Activation
Whenever a service is resolved, the activation event is dispatched. An activation handler receives a context and a resolved value and returns the handled resolved value.

interface Weapon {
  damage: number;
}

export class Katana implements Weapon {
  #damage: number = 10;

  public get damage(): number {
    return this.#damage;
  }

  public improve(): void {
    this.#damage += 2;
  }
}

const container: Container = new Container();
container.bind<Weapon>('Weapon').to(Katana);
container.onActivation(
  'Weapon',
  (_context: ResolutionContext, katana: Katana): Katana | Promise<Katana> => {
    katana.improve();

    return katana;
  },
);

// Katana.damage is 12
const katana: Weapon = container.get<Weapon>('Weapon');

There are multiple ways to provide an activation handler

Adding the handler to the container.
Adding the handler to the binding.
Adding the handler to the class through the postConstruct decorator.
When multiple activation handlers are binded to a service identifier, the postConstruct handler is called before any others. After that, the binding handler is called. Then, container handlers are called, starting at the root container and descending the descendant containers stopping at the container with the binding.

Deactivation
Whenever a singleton scoped service is unbound, the deactivation event is dispatched. A deactivation handler receives a resolved value and returns nothing.

interface Weapon {
  damage: number;
}

class Katana implements Weapon {
  readonly #damage: number = 10;

  public get damage(): number {
    return this.#damage;
  }
}

const container: Container = new Container();

container.bind<Weapon>('Weapon').to(Katana).inSingletonScope();

container.get('Weapon');

container.onDeactivation('Weapon', (weapon: Weapon): void | Promise<void> => {
  console.log(`Deactivating weapon with damage ${weapon.damage.toString()}`);
});

await container.unbind('Weapon');

It's possible to add a deactivation handler in multiple ways

Adding the handler to the container.
Adding the handler to a binding.
Adding the handler to the class through the preDestroy decorator.
Handlers added to the container are the first ones to be resolved. Any handler added to a child container is called before the ones added to their parent. Relevant bindings from the container are called next and finally the preDestroy method is called. In the example above, relevant bindings are those bindings bound to the unbinded "Destroyable" service identifier.

Inheritance
Inheritance can be achieved relying on the @injectFromBase decorator. This decorator allows you to inject dependencies from the base class. Refer to the API documentation for more information.

Previous versions of inversify used to provide implicitly injection inheritance. However, this approach was deprecated in favor of the @injectFromBase decorator.

Motivation
Decorators are not designed to be inherited. Class inheritance doesn't play well with the former approach. The @injectFromBase decorator allows the developer whether or not decoration inheritance should be provided.

In exchange of implicit inheritance, previous inversify versions performed multiple checks to ensure every class argument was injected. Some edge case scenarios forced to declare unmanaged parent constructor arguments so inversify could bypass these checks.

It makes no sense to declare parent constructor argument injections in cases in which the child class requires no injection at all:
class BaseShape {
  kind: string;

  // We should not inject the kind in the parent class
  constructor(kind: string) {
    this.kind = kind;
  }
}

class SquareShape extends BaseShape {
  constructor() {
    super('square');
  }
}

It makes no sense to declare parent constructor argument injections in cases in which the child class arguments don't match the parent class arguments:
class BaseShape {
  // We should not inject kind nor sides, for they are likely to be in the wrong order in the child class
  constructor(
    public readonly kind: string,
    public readonly sides: number,
  ) {}
}

class RegularPolygonShape extends BaseShape {
  constructor(sides: number) {
    super('RegularPolygon', sides);
  }
}


The current approach allows the developer to decide whether or not to inherit the parent class injections relying on the @injectFromBase decorator.

Plugins
InversifyJS provides a plugin system that allows you to extend the container's functionality. Plugins can add new methods to the container, hook into the container's lifecycle, and interact with the container's internal services.

Creating a Plugin
danger
Plugins are, at the moment, an experimental feature and may change in future releases. Use them at your own risk.

To create a plugin, you need to extend the Plugin class from @inversifyjs/plugin and implement the load method. The load method receives a PluginApi object that allows the plugin to define new methods on the container and hook into the container's resolution process.

import { Plugin, PluginApi, PluginContext } from '@inversifyjs/plugin';
import { Container } from 'inversify';

// Extend the container with plugin defined methods
declare module 'inversify' {
  interface Container {
    myMethod(...args: any[]): string;
  }
}

class MyPlugin extends Plugin<Container> {
  public load(api: PluginApi): void {
    // Define a new method on the container
    api.define('myMethod', (...args) => {
      // Implementation of the method
      return 'Result of myMethod';
    });

    // Hook into the container's plan phase
    api.onPlan((options, result) => {
      // Do something with the plan result
      console.log(`Planning resolution for ${String(options.serviceId)}`);
    });
  }
}

Plugin Context
When a plugin is created, it receives a container instance and a plugin context. The plugin context provides access to the container's internal services:

activationService: Manages the activation handlers for services (binding activation is set in the binding).
bindingService: Manages the bindings in the container.
deactivationService: Manages the deactivation handlers for services (binding deactivation is set in the binding).
planResultCacheService: Manages the cache of plan results.
These services allow plugins to interact with the container's core functionality and provide advanced extensions.

Registering a Plugin
To use a plugin, you need to register it with the container using the register method:

const container = new Container();
container.register(MyPlugin);

Once registered, the plugin can add methods to the container, hook into the container's lifecycle, and modify the container's behavior.

Plugin API
The PluginApi interface provides the following methods:

define
define(name: string | symbol, method: (...args: any[]) => unknown): void

Defines a new method on the container. The method will be available on the container instance after the plugin is registered.

onPlan
onPlan(handler: (options: GetPlanOptions, result: PlanResult) => void): void

Registers a handler that is called when the container plans a resolution. This can be used to modify the resolution plan or perform additional actions during the resolution process.

Plugins provide a clean way to extend InversifyJS without modifying its core code, allowing for modular and maintainable extensions.



Snapshot
Snapshots allow you to save the state of your Inversify container at a specific moment in time. These snapshots capture the container's state, enabling you to revert back to that state if needed.

Think of it as taking a picture of your container, preserving the exact configurations and dependencies present when the snapshot was taken. This can be incredibly useful for debugging, testing, or tracking changes made to your container over time.

By creating snapshots of your Inversify container, you can easily roll back to a previous working state or compare different configurations without manually recreating them. This functionality can save you time and effort, making your development process smoother and more efficient.

Refer to the API documentation for more information on how to create and use snapshots in Inversify.


TypeScript Requirements
This page outlines the TypeScript configuration requirements for using InversifyJS.

Required TypeScript Configuration
InversifyJS relies on TypeScript's reflection metadata capabilities. You need to configure your TypeScript compiler with the following options:

Decorator Support
Enable experimental decorators and metadata emission in your tsconfig.json:

{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    // other options...
  }
}

ES2022 Error Support
InversifyJS uses the ErrorOptions type which requires ES2022 support. You have two options:

Set your TypeScript target to ES2022 or later:
{
  "compilerOptions": {
    "target": "ES2022",
    // other options...
  }
}

Or alternatively, include the ES2022.Error library in your TypeScript configuration:
{
  "compilerOptions": {
    "lib": ["ES2022.Error", /* other libs... */],
    // other options...
  }
}

Strict Mode Considerations
While not required, InversifyJS works well with TypeScript's strict mode. If you're using strict mode, you might need to provide more explicit type annotations in some cases.

Using bundlers
InversifyJS can be used with any bundler that supports transpiling TypeScript legacy decorators and emitting TypeScript class metadata.

If your bundler does not transpile TypeScript legacy decorators, you won't be able to use InversifyJS without a plugin that does it.

If your bundler does not emit TypeScript class metadata, InversifyJS won't be able to provide the following features:

Autobinding.
Class constructor parameters or properties without the need to include an @inject decorator.
esbuild
esbuild does not support transpiling TypeScript legacy decorators as explained in this issue.

Rollup
You can use the @rollup/plugin-typescript plugin to successfully transpile TypeScript code with legacy decorators.

Vite
Vite uses esbuild under the hood, so it also does not support transpiling TypeScript legacy decorators. However, you can use the unplugin-swc plugin to transpile TypeScript legacy decorators.

vite.config.ts
import swc from "unplugin-swc";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Vite plugin
    swc.vite(),
  ],
});

Refer to this issue for more information.

Webpack
You can use the ts-loader plugin to successfully transpile TypeScript code with legacy decorators.
