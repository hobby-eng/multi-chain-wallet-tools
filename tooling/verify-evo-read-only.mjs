import { API } from 'typescript/unstable/sync';
import * as ts from 'typescript/unstable/ast';

const LOW_LEVEL_WRITE_METHODS = new Set([
  'addressFundsTransfer',
  'addressFundsWithdraw',
  'addressFundingFromAssetLock',
  'identityCreditWithdrawal',
  'identityTopUpFromAddresses',
  'identityTransferToAddresses',
  'broadcastStateTransition',
  'broadcastAndWait',
  'broadcastAndWaitForAffectedState',
]);

const FACADE_WRITE_METHODS = new Map([
  ['addresses', new Set(['transfer', 'withdraw', 'topUpIdentity', 'transferFromIdentity', 'fundFromAssetLock', 'createIdentity'])],
  ['identities', new Set(['create', 'creditTransfer', 'creditWithdrawal', 'topUp', 'update'])],
  ['documents', new Set(['create', 'replace', 'delete', 'transfer', 'purchase', 'setPrice'])],
  ['contracts', new Set(['publish', 'update'])],
  ['tokens', new Set([
    'mint',
    'burn',
    'transfer',
    'freeze',
    'unfreeze',
    'destroyFrozen',
    'emergencyAction',
    'setPrice',
    'directPurchase',
    'claim',
    'configUpdate',
  ])],
  ['dpns', new Set(['registerName'])],
  ['voting', new Set(['masternodeVote'])],
  ['stateTransitions', new Set([
    'broadcastStateTransition',
    'broadcastAndWait',
    'broadcastAndWaitForAffectedState',
  ])],
]);

function staticString(node, strings) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return strings.get(node.text);
  return undefined;
}

function expressionPath(node, aliases, strings) {
  if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
    return expressionPath(node.expression, aliases, strings);
  }
  if (ts.isIdentifier(node)) return aliases.get(node.text) ?? [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    const base = expressionPath(node.expression, aliases, strings);
    return base === undefined ? undefined : [...base, node.name.text];
  }
  if (ts.isElementAccessExpression(node)) {
    const base = expressionPath(node.expression, aliases, strings);
    const property = node.argumentExpression === undefined
      ? undefined
      : staticString(node.argumentExpression, strings);
    return base === undefined || property === undefined ? undefined : [...base, property];
  }
  return undefined;
}

function recordBinding(binding, path, aliases) {
  if (ts.isIdentifier(binding)) {
    aliases.set(binding.text, path);
    return;
  }
  for (const element of binding.elements) {
    if (element.dotDotDotToken !== undefined) continue;
    const property = element.propertyName === undefined
      ? ts.isIdentifier(element.name) ? element.name.text : undefined
      : ts.isIdentifier(element.propertyName)
        || ts.isStringLiteral(element.propertyName)
        || ts.isNoSubstitutionTemplateLiteral(element.propertyName)
        ? element.propertyName.text
        : undefined;
    if (property !== undefined) recordBinding(element.name, [...path, property], aliases);
  }
}

function describeWrite(path) {
  const method = path.at(-1);
  if (method === undefined) return undefined;
  if (LOW_LEVEL_WRITE_METHODS.has(method)) return `low-level state-transition method ${method}`;
  const facade = path.at(-2);
  if (facade !== undefined && FACADE_WRITE_METHODS.get(facade)?.has(method) === true) {
    return `write-capable ${facade}.${method} facade`;
  }
  return undefined;
}

function findInSourceFile(sourceFile) {
  const aliases = new Map();
  const strings = new Map();
  const findings = [];

  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      if (ts.isIdentifier(node.name)) {
        const value = staticString(node.initializer, strings);
        if (value !== undefined) strings.set(node.name.text, value);
      }
      const path = expressionPath(node.initializer, aliases, strings);
      if (path !== undefined) recordBinding(node.name, path, aliases);
    }
    if (ts.isCallExpression(node)) {
      const path = expressionPath(node.expression, aliases, strings);
      const description = path === undefined ? undefined : describeWrite(path);
      if (description !== undefined) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile));
        findings.push({
          path: sourceFile.fileName,
          line: location.line + 1,
          column: location.character + 1,
          description,
        });
      }
    }
    node.forEachChild(visit);
  }

  visit(sourceFile);
  return findings;
}

export function findEvoWriteCalls(paths, cwd = process.cwd()) {
  const api = new API({ cwd });
  try {
    const snapshot = api.updateSnapshot({ openFiles: paths });
    try {
      return paths.flatMap((path) => {
        const project = snapshot.getDefaultProjectForFile(path);
        const sourceFile = project?.program.getSourceFile(path);
        if (sourceFile === undefined) throw new Error(`TypeScript could not parse reviewed source ${path}.`);
        return findInSourceFile(sourceFile);
      });
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

export function assertEvoSdkReadOnly(paths, boundaryName, cwd = process.cwd()) {
  const finding = findEvoWriteCalls(paths, cwd)[0];
  if (finding !== undefined) {
    throw new Error(
      `${boundaryName} crosses its read-only/scan-only boundary through a ${finding.description} `
      + `at ${finding.path}:${finding.line}:${finding.column}.`,
    );
  }
}
