import {
  CompanionActionDefinition,
  CompanionActionDefinitions,
  CompanionActionEvent,
  CompanionInputFieldTextInput,
  InstanceBase,
  DropdownChoice,
} from '@companion-module/base'
import { EmberClient } from 'node-emberplus/lib/client/ember-client'
import { ParameterType, parameterTypeToString as typeToString} from 'node-emberplus/lib/common/parameter-type' 
import { EmberPlusConfig } from './config'
import { TreeNode } from 'node-emberplus/lib/common/tree-node'
import { QualifiedParameter } from 'node-emberplus/lib/common/qualified-parameter'

export enum ActionId {
  SetValueInt = 'setValueInt',
  SetValueReal = 'setValueReal',
  SetValueString = 'setValueString',
  SetValueBoolean = 'setValueBoolean',
  SetValueEnum = 'setValueEnum',
  SetValueExpression = 'setValueExpression',
  SetIncrement = 'setValueIncrement',
  SetDecrement = 'setValueDecrement',
  ToogleBoolean = 'toggleValue',
}

const pathInput: CompanionInputFieldTextInput = {
  type: 'textinput',
  label: 'Path',
  id: 'path',
}

const setValue =
  (self: InstanceBase<EmberPlusConfig>, emberClient: EmberClient, type: ParameterType) =>
  async (action: CompanionActionEvent): Promise<void> => {
    let selected_path = ''
    if (action.options['use_select'])
      selected_path = action.options['varPath'] as string
    else
      selected_path = action.options['path'] as string

    // getElementByPath is only working for Nodes -> seperate Param number from full path
    const path_nodes = selected_path.split('.')
    const param_num = path_nodes[path_nodes.length - 1]
    path_nodes.pop()

    const parent_node : TreeNode = await emberClient.getElementByPathAsync(path_nodes.join('.'))

    const param_node = parent_node.getElementByNumber(Number(param_num)) as QualifiedParameter
    
    let value = action.options['value']

    if (param_node && param_node.isParameter()) {

      if (type == ParameterType.integer && (param_node.getJSONContent()['maximum']))
      {
        // check integer against Min/Max Ember+ value
        if (param_node.getJSONContent()['enumeration'] == undefined && ((value ?? 0) > param_node.getJSONContent()['maximum']))
          value = param_node.getJSONContent()['maximum']
        else if (param_node.getJSONContent()['enumeration'] == undefined && ((value ?? 0) < param_node.getJSONContent()['minimum']))
          value = param_node.getJSONContent()['minimum']
      }
      if(type == ParameterType.boolean)
      {
        await emberClient.setValueAsync(
          param_node as QualifiedParameter,
          value as boolean,
          type
        )
      }
      else if (param_node.getJSONContent()['maximum'] || !isNaN(Number(value))) {
        await emberClient.setValueAsync(
          param_node as QualifiedParameter,
          value as number,
          ParameterType.integer
        )
      } 
      else if(type == ParameterType.string && param_node.getJSONContent()['type'] == typeToString(type))
      {
        await emberClient.setValueAsync(
          param_node as QualifiedParameter,
          value as string,
          type
        )
      }
      else
      {
        self.log(
          'warn',
          'Node ' + selected_path + ' is not of type ' + typeToString(type) + ' (is ' + param_node.getJSONContent()['type'] + ')'
        )
      }
    } else {
      self.log('warn', 'Parameter ' + selected_path + ' not found or not a parameter')
    }
  }

  const setValueExpression =
  (self: InstanceBase<EmberPlusConfig>, emberClient: EmberClient) =>
  async (action: CompanionActionEvent): Promise<void> => {
    let selected_path = ''
    if (action.options['use_select'])
      selected_path = action.options['varPath'] as string
    else
      selected_path = action.options['path'] as string

    // getElementByPath is only working for Nodes -> seperate Param number from full path
    const path_nodes = selected_path.split('.')
    const param_num = path_nodes[path_nodes.length - 1]
    path_nodes.pop()

    const parent_node : TreeNode = await emberClient.getElementByPathAsync(path_nodes.join('.'))

    const param_node = parent_node.getElementByNumber(Number(param_num)) as QualifiedParameter

    if (param_node && param_node.isParameter()) {
      if (param_node.getJSONContent()['maximum']) {
        self.log('debug', 'Got node on ' + action.options['path'] + 'set val: ' + action.options['value'])
        let value = await self.parseVariablesInString(action.options['value'] as string)

        // check integer against Min/Max Ember+ value
        if (param_node.getJSONContent()['enumeration'] == undefined && (value > param_node.getJSONContent()['maximum']))
          value = param_node.getJSONContent()['maximum']
        else if (param_node.getJSONContent()['enumeration'] == undefined && (value < param_node.getJSONContent()['minimum']))
          value = param_node.getJSONContent()['minimum']

        await emberClient.setValueAsync(
          param_node as QualifiedParameter,
          Number(value),
          ParameterType.integer
        )
    
      } else {
        self.log(
          'warn',
          'Node ' + selected_path + ' is not of type ' + typeToString(ParameterType.integer) + ' or ' + typeToString(ParameterType.enum) +  ' (is ' + param_node.getJSONContent()['type']  + ')'
        )
      }
    } else {
      self.log('warn', 'Parameter ' + selected_path + ' not found or not a parameter')
    }
  }

  const setIncrementDecrement =
  (self: InstanceBase<EmberPlusConfig>, emberClient: EmberClient, type: string) =>
  async (action: CompanionActionEvent): Promise<void> => {
    let selected_path = ''
    if (action.options['use_select'])
      selected_path = action.options['varPath'] as string
    else
      selected_path = action.options['path'] as string

    // getElementByPath is only working for Nodes -> seperate Param number from full path
    const path_nodes = selected_path.split('.')
    const param_num = path_nodes[path_nodes.length - 1]
    path_nodes.pop()

    const parent_node : TreeNode = await emberClient.getElementByPathAsync(path_nodes.join('.'))

    const param_node = parent_node.getElementByNumber(Number(param_num)) as QualifiedParameter

    if (param_node && param_node.isParameter()) {
      // check if integer or enum (parameter types have Content 'minimum' or 'maximum') -> value in Content 'type' is always string
      if (param_node.getJSONContent()['maximum']) {
        if(type === 'increment')
        {
          // check integer against Max Ember+ value
          if (param_node.getJSONContent()['enumeration'] == undefined && 
              (Number(param_node.getJSONContent()['value']) + (action.options['value'] as number) > param_node.getJSONContent()['maximum']))
          {
            await emberClient.setValueAsync(
              param_node,
              Number(param_node.getJSONContent()['maximum']),
              ParameterType.integer
            )
          }
          else
          {
            await emberClient.setValueAsync(
              param_node,
              Number(param_node.getJSONContent()['value']) + (action.options['value'] as number),
              ParameterType.integer
            )
          }
        }
        else
        {
          // check integer against Min Ember+ value
          if (param_node.getJSONContent()['enumeration'] == undefined && 
              (Number(param_node.getJSONContent()['value']) - (action.options['value'] as number) < param_node.getJSONContent()['minimum']))
          {
            await emberClient.setValueAsync(
              param_node,
              Number(param_node.getJSONContent()['minimum']),
              ParameterType.integer
            )
          }
          else
          {
            await emberClient.setValueAsync(
              param_node,
              Number(param_node.getJSONContent()['value']) - (action.options['value'] as number),
              ParameterType.integer
            )
          }
        } 
      } else {
        self.log(
          'warn',
          'Node ' + selected_path + ' is not of type ' + typeToString(ParameterType.integer) + ' or ' + typeToString(ParameterType.enum) + ' (is ' + param_node.getJSONContent()['type'] + ')'
        )
      }
    } else {
      self.log('warn', 'Parameter ' + selected_path + ' not found or not a parameter')
    }
  }

  const setToggle =
  (self: InstanceBase<EmberPlusConfig>, emberClient: EmberClient) =>
  async (action: CompanionActionEvent): Promise<void> => {
    let selected_path = ''
    if (action.options['use_select'])
      selected_path = action.options['varPath'] as string
    else
      selected_path = action.options['path'] as string

    // getElementByPath is only working for Nodes -> seperate Param number from full path
    const path_nodes = selected_path.split('.')
    const param_num = path_nodes[path_nodes.length - 1]
    path_nodes.pop()

    const parent_node : TreeNode = await emberClient.getElementByPathAsync(path_nodes.join('.'))

    const param_node = parent_node.getElementByNumber(Number(param_num)) as QualifiedParameter

    if (param_node && param_node.isParameter()) {
      // check if boolean
      if (param_node.getJSONContent()['value'] === true || param_node.getJSONContent()['value'] === false) {
        if (param_node.getJSONContent()['value'] === true )
          await emberClient.setValueAsync(param_node,false,ParameterType.boolean)
        else
          await emberClient.setValueAsync(param_node,true,ParameterType.boolean)
      } else {
        self.log(
          'warn',
          'Node ' + selected_path + ' is not of type Boolean'
        )
      }
    } else {
      self.log('warn', 'Parameter ' + selected_path + ' not found or not a parameter')
    }
  }

export function GetActionsList(
  self: InstanceBase<EmberPlusConfig>,
  emberClient: EmberClient,
  config: EmberPlusConfig
): CompanionActionDefinitions {
  const actions: { [id in ActionId]: CompanionActionDefinition | undefined } = {
    [ActionId.SetValueInt]: {
      name: 'Set Value Integer',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'number',
          label: 'Value',
          id: 'value',
          required: true,
          min: -0xffffffff,
          max: 0xffffffff,
          default: 0,
          step: 1,
        },
      ],
      callback: setValue(self, emberClient, ParameterType.integer),
    },
    [ActionId.SetValueReal]: {
      name: 'Set Value Real',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'number',
          label: 'Value',
          id: 'value',
          required: true,
          min: -0xffffffff,
          max: 0xffffffff,
          default: 0,
          step: 0.001, // TODO - don't want this at all preferably
        },
      ],
      callback: setValue(self, emberClient, ParameterType.real),
    },
    [ActionId.SetValueBoolean]: {
      name: 'Set Value Boolean',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'checkbox',
          label: 'Value',
          id: 'value',
          default: false,
        },
      ],
      callback: setValue(self, emberClient, ParameterType.boolean),
    },
    [ActionId.SetValueEnum]: {
      name: 'Set Value ENUM (as Integer)',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'number',
          label: 'Value',
          id: 'value',
          required: true,
          min: 0x00000000,
          max: 0xffffffff,
          default: 0,
          step: 1,
        },
      ],
      callback: setValue(self, emberClient, ParameterType.enum),
    },
    [ActionId.SetValueString]: {
      name: 'Set Value String',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'textinput',
          label: 'Value',
          id: 'value',
        },
      ],
      callback: setValue(self, emberClient, ParameterType.string),
    },
    [ActionId.SetValueExpression]: {
      name: 'Set Value with Expression',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'textinput',
          label: 'Value',
          id: 'value',
          useVariables: true,
        },
      ],
      callback: setValueExpression(self, emberClient),
    },
    [ActionId.SetIncrement]: {
      name: 'Set Value Increment',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'number',
          label: 'Value',
          id: 'value',
          required: true,
          min: 0,
          max: 0xffffffff,
          default: 1,
          step: 1,
        },
      ],
      callback: setIncrementDecrement(self, emberClient, 'increment'),
    },
    [ActionId.SetDecrement]: {
      name: 'Set Value Decrement',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
        {
          type: 'number',
          label: 'Value',
          id: 'value',
          required: true,
          min: 0,
          max: 0xffffffff,
          default: 1,
          step: 1,
        },
      ],
      callback: setIncrementDecrement(self, emberClient, 'decrement'),
    },
    [ActionId.ToogleBoolean]: {
      name: 'Toggle Value Boolean',
      options: [
        pathInput,
        {
          type: 'checkbox',
          label: 'Use Selected',
          id: 'use_select',
          default: false,
        },
        {
          type: 'dropdown',
          label: 'Select registered path',
          id: 'varPath',
          choices: config.monitoredParameters?.map(({id,label}) => <DropdownChoice>{id: id, label: label}) ?? [],
          default: config.monitoredParameters?.find(() => true)?.id ?? 'No paths configured!',
        },
      ],
      callback: setToggle(self, emberClient),
    },
  }

  return actions
}
