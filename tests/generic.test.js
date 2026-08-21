import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as generic from '../shared/analyzer/languages/generic.js';

test('generic: C/C++ includes, functions, and main', () => {
  const src = [
    '#include "util.h"',
    '#include <stdio.h>',
    'int add(int a, int b) { return a + b; }',
    'void helper() {}',
    'int main(int argc, char** argv) { return 0; }',
  ].join('\n');

  const out = generic.analyze(src, 'src/main.c');
  assert.equal(out.hasMain, true);
  assert.deepEqual(out.imports.map((i) => i.spec).sort(), ['stdio.h', 'util.h']);
  assert.deepEqual(out.functions.map((f) => f.name).sort(), ['add', 'helper', 'main']);

  const has = (p) => ['src/util.h'].includes(p);
  const context = { findByName: (n) => (n === 'util.h' ? 'src/util.h' : null) };

  assert.deepEqual(
    generic.resolveImport('util.h', 'src/main.c', has, context, { local: true }),
    { path: 'src/util.h' }
  );
  assert.deepEqual(
    generic.resolveImport('stdio.h', 'src/main.c', has, context, { local: false }),
    { external: 'stdio.h' }
  );
});

test('generic: Java imports, classes, and methods', () => {
  const src = [
    'package com.example.app;',
    'import com.example.service.UserService;',
    'import com.example.model.User;',
    'import java.util.List;',
    'import static org.junit.Assert.assertEquals;',
    'public class AppController {',
    '  private UserService userService;',
    '  public void handleRequest(String id) {',
    '  }',
    '}',
  ].join('\n');

  const out = generic.analyze(src, 'src/main/java/com/example/app/AppController.java');
  const specs = out.imports.map((i) => i.spec).sort();
  assert.deepEqual(specs, [
    'com.example.model.User',
    'com.example.service.UserService',
    'java.util.List',
    'org.junit.Assert.assertEquals',
  ]);
  assert.deepEqual(out.classes.map((c) => c.name), ['AppController']);
  assert.deepEqual(out.functions.map((f) => f.name), ['handleRequest']);

  const has = (p) => [
    'src/main/java/com/example/service/UserService.java',
    'src/main/java/com/example/model/User.java',
  ].includes(p);
  const context = {
    findByName: (n) => {
      if (n === 'UserService.java') return 'src/main/java/com/example/service/UserService.java';
      if (n === 'User.java') return 'src/main/java/com/example/model/User.java';
      return null;
    },
  };

  assert.deepEqual(
    generic.resolveImport(
      'com.example.service.UserService',
      'src/main/java/com/example/app/AppController.java',
      has,
      context,
      { kind: 'import' }
    ),
    { path: 'src/main/java/com/example/service/UserService.java' }
  );

  assert.deepEqual(
    generic.resolveImport(
      'java.util.List',
      'src/main/java/com/example/app/AppController.java',
      has,
      context,
      { kind: 'import' }
    ),
    { external: 'java' }
  );
});

test('generic: Rust use, mod, functions, and structs', () => {
  const src = [
    'mod helpers;',
    'use crate::models::User;',
    'use serde::Serialize;',
    'pub struct App {}',
    'pub fn run() {}',
  ].join('\n');

  const out = generic.analyze(src, 'src/main.rs');
  assert.deepEqual(out.imports.map((i) => i.spec).sort(), ['crate::models::User', 'helpers', 'serde::Serialize']);
  assert.deepEqual(out.classes.map((c) => c.name), ['App']);
  assert.deepEqual(out.functions.map((f) => f.name), ['run']);

  const has = (p) => ['src/helpers.rs', 'src/models.rs'].includes(p);
  const context = { findByName: (n) => (n === 'helpers.rs' ? 'src/helpers.rs' : null) };

  assert.deepEqual(
    generic.resolveImport('helpers', 'src/main.rs', has, context, { kind: 'mod' }),
    { path: 'src/helpers.rs' }
  );
  assert.deepEqual(
    generic.resolveImport('serde::Serialize', 'src/main.rs', has, context, { kind: 'use' }),
    { external: 'serde' }
  );
});

test('generic: Ruby require, require_relative, defs, and classes', () => {
  const src = [
    'require "json"',
    'require_relative "lib/helper"',
    'class Greeter',
    '  def greet(name)',
    '  end',
    'end',
  ].join('\n');

  const out = generic.analyze(src, 'app.rb');
  assert.deepEqual(out.imports.map((i) => i.spec).sort(), ['json', 'lib/helper']);
  assert.deepEqual(out.classes.map((c) => c.name), ['Greeter']);
  assert.deepEqual(out.functions.map((f) => f.name), ['greet']);

  const has = (p) => ['lib/helper.rb'].includes(p);
  const context = { findByName: (n) => (n === 'helper.rb' ? 'lib/helper.rb' : null) };

  assert.deepEqual(
    generic.resolveImport('lib/helper', 'app.rb', has, context, { kind: 'require_relative' }),
    { path: 'lib/helper.rb' }
  );
  assert.deepEqual(
    generic.resolveImport('json', 'app.rb', has, context, { kind: 'require' }),
    { external: 'json' }
  );
});

test('generic: PHP require, use, functions, and classes', () => {
  const src = [
    '<?php',
    'require_once "vendor/autoload.php";',
    'use App\\Models\\User;',
    'class HomeController {',
    '  function index() {}',
    '}',
  ].join('\n');

  const out = generic.analyze(src, 'app/HomeController.php');
  assert.deepEqual(out.imports.map((i) => i.spec).sort(), ['App\\Models\\User', 'vendor/autoload.php']);
  assert.deepEqual(out.classes.map((c) => c.name), ['HomeController']);
  assert.deepEqual(out.functions.map((f) => f.name), ['index']);

  const has = (p) => ['app/Models/User.php'].includes(p);
  const context = { findByName: (n) => (n === 'User.php' ? 'app/Models/User.php' : null) };

  assert.deepEqual(
    generic.resolveImport('App\\Models\\User', 'app/HomeController.php', has, context, { kind: 'use' }),
    { path: 'app/Models/User.php' }
  );
  assert.deepEqual(
    generic.resolveImport('GuzzleHttp\\Client', 'app/HomeController.php', has, context, { kind: 'use' }),
    { external: 'GuzzleHttp' }
  );
});
