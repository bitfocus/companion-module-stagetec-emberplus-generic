import { InstanceBase, InstanceStatus, SomeCompanionConfigField, runEntrypoint } from '@companion-module/base'
import { GetActionsList } from './actions'
import { EmberPlusConfig, GetConfigFields, parsingPath } from './config'
import { FeedbackId, GetFeedbacksList } from './feedback'
import { EmberPlusState } from './state'
import { EmberClient } from 'node-emberplus/lib/client/ember-client' // note - emberplus-conn is in parent repo, not sure if it needs to be defined as dependency
import { GetVariablesList } from './variables'
import { TreeNode } from 'node-emberplus/lib/common/tree-node'

/**
 * Companion instance class for generic EmBER+ Devices
 */
class EmberPlusInstance extends InstanceBase<EmberPlusConfig> {
	private emberClient!: EmberClient
	private config!: EmberPlusConfig
	private state!: EmberPlusState

	// Override base types to make types stricter
	public checkFeedbacks(...feedbackTypes: string[]): void {
		// todo - arg should be of type FeedbackId
		super.checkFeedbacks(...feedbackTypes)
	}

	/**
	 * Main initialization function called once the module
	 * is OK to start doing things.
	 */
	public async init(config: EmberPlusConfig): Promise<void> {
		this.config = config
		this.state = new EmberPlusState()

		this.setupEmberConnection()
		this.setupParseFilters()
		this.setupMonitoredParams()
		this.updateCompanionBits()
	}

	/**
	 * Process an updated configuration array.
	 */
	public async configUpdated(config: EmberPlusConfig): Promise<void> {
		this.config = config

		this.emberClient.removeAllListeners()

		this.setupParseFilters()
		this.setupMonitoredParams()
		this.updateCompanionBits()
		this.setupEmberConnection()
	}

	/**
	 * Creates the configuration fields for web config.
	 */
	public getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/**
	 * Clean up the instance before it is destroyed.
	 */
	public async destroy(): Promise<void> {
		await this.emberClient.disconnectAsync()
	}

	private updateCompanionBits(): void {
		this.setActionDefinitions(GetActionsList(this, this.client, this.config))
		this.setFeedbackDefinitions(GetFeedbacksList(this, this.client, this.config))
		this.setVariableDefinitions(GetVariablesList(this.config))
	}

	private get client(): EmberClient {
		return this.emberClient
	}

	private setupEmberConnection(): void {
		this.log('debug', 'connecting ' + (this.config.host || '') + ':' + this.config.port)
		this.updateStatus(InstanceStatus.Connecting)

		this.emberClient = new EmberClient({ host: this.config.host || '', port: this.config.port, timeoutValue: 5000 })
		this.emberClient.on('error', (e) => {
			this.log('error', 'Error ' + e)
		})
		this.emberClient.on('connected', () => {
			Promise.resolve()
				.then(async () => {
					await this.emberClient.getDirectoryAsync()

					if (this.config.autoParse) {
						this.log('info', 'AutoParse for Parameters ...')
						await this.handleEmberTreeParsing(this.emberClient.root, '', 0)
						this.log('info', 'Finished ...')
					}

					await this.registerParameters()
					this.updateCompanionBits()
					this.updateStatus(InstanceStatus.Ok)
				})
				.catch((e) => {
					// get root
					this.updateStatus(InstanceStatus.ConnectionFailure)
					this.log('error', 'Failed to discover root or subscribe to path: ' + e)
				})
		})
		this.emberClient.on('disconnected', () => {
			this.updateStatus(InstanceStatus.Connecting)
		})
		this.emberClient.connectAsync().catch((e) => {
			this.updateStatus(InstanceStatus.ConnectionFailure)
			this.log('error', 'Error ' + e)
		})
	}

	private setupMonitoredParams(): void {
		this.config.monitoredParameters = []
		this.config.parseParameterPaths = []
		if (this.config.monitoredParametersString) {
			const params = this.config.monitoredParametersString.split(',')
			params.map((item) => this.config.parseParameterPaths?.push({ id: item, label: item }))
		}
	}

	private setupParseFilters(): void {
		this.config.parseNodeFilter = []
		this.config.parseParamFilter = []
		this.config.autoParsePaths = []
		if (this.config.autoParsePathsString)
			this.config.autoParsePaths = this.config.autoParsePathsString
				.split(',')
				.map((path) => <parsingPath>{ path: path, elements: path.split('.') })
		if (this.config.parseNodeFilterString) {
			this.config.parseNodeFilter = this.config.parseNodeFilterString.split(',')
		}
		if (this.config.parseParamFilterString) {
			this.config.parseParamFilter = this.config.parseParamFilterString.split(',')
		}
	}

	private async registerParameters() {
		this.log('info', 'Start parameter path registration')
		for (const param of this.config.parseParameterPaths ?? []) {
			try {
				const path_nodes = param.id.split('.')
				const param_num = path_nodes[path_nodes.length - 1]
				path_nodes.pop()

				const parent_node: TreeNode = await this.emberClient.getElementByPathAsync(path_nodes.join('.'))

				const param_node = parent_node.getElementByNumber(Number(param_num)) as TreeNode
				param_node.getDirectory((node) => {
					this.handleChangedValue(param.label, node).catch((e) => this.log('error', 'Error handling parameter ' + e))
				})
				// add to variables
				this.config.monitoredParameters!.push(param)
				this.setVariableDefinitions(GetVariablesList(this.config))

				if (param_node) {
					//this.log('debug', 'Registered for path "' + param.label + '"')
					await this.handleChangedValue(param.label, param_node)
				}
			} catch (e) {
				this.log('error', 'Failed to subscribe to path "' + param.id + '": ' + e)
			}
		}
		this.log('info', 'Finished ...')
	}

	private async handleChangedValue(path: string, node: TreeNode) {
		if (node.isParameter()) {
			// check if enumeration value
			if (node.getJSONContent()['enumeration'] !== undefined) {
				const curr_value = node.getJSONContent()['value']
				const enumValues = node.getJSONContent()['enumeration'].split('\n')
				this.state.parameters.set(path, enumValues.at(curr_value as number) ?? '')
			} else {
				// check if integer value has factor to be applied
				if (node.getJSONContent()['factor'] !== undefined) {
					const curr_value = (node.getJSONContent()['value'] as number) / node.getJSONContent()['factor']
					this.state.parameters.set(path, curr_value.toString() ?? '')
				} else this.state.parameters.set(path, node.getJSONContent()['value'] ?? '')
			}
			for (const feedback in FeedbackId) this.checkFeedbacks(feedback)
			this.setVariableValues({ [path]: this.state.parameters.get(path) })
		}
	}

	private async handleEmberTreeParsing(node: TreeNode, identifiers: string, curr_layer: number) {
		this.config.monitoredParameters ??= []

		if ((node.isRoot() || node.isNode()) && this.config.monitoredParameters.length < 2048) {
			if (node.hasChildren()) {
				for (const child of node.getChildren() ?? []) {
					const curr_child = child as TreeNode
					const identifier = curr_child.getJSONContent()['identifier']?.replace('#', '')

					// check if node is online
					if (curr_child.isNode() && !curr_child.getJSONContent()['isOnline']) continue

					if (this.config.autoParsePaths && this.config.autoParsePaths.length > 0) {
						for (const entry of this.config.autoParsePaths) {
							if (
								(curr_layer >= entry.elements.length && curr_child.getJSONContent()['path'].startsWith(entry.path)) ||
								(curr_layer < entry.elements.length && entry.path.startsWith(curr_child.getJSONContent()['path']))
							) {
								if (curr_child.isNode()) await this.emberClient.getDirectoryAsync(curr_child)

								if (identifiers == '') await this.handleEmberTreeParsing(curr_child, identifier || '', curr_layer + 1)
								else await this.handleEmberTreeParsing(curr_child, identifiers + '.' + identifier || '', curr_layer + 1)
								break
							}
						}
					} else {
						if (curr_child.isNode()) await this.emberClient.getDirectoryAsync(curr_child)

						if (identifiers == '') await this.handleEmberTreeParsing(curr_child, identifier || '', curr_layer + 1)
						else await this.handleEmberTreeParsing(curr_child, identifiers + '.' + identifier || '', curr_layer + 1)
					}
				}
			}
		} else if (node.isParameter() && this.config.monitoredParameters.length < 2048) {
			try {
				if (this.config.parseNodeFilterString) {
					for (const nodeFilter of this.config.parseNodeFilter ?? []) {
						if (identifiers.includes(nodeFilter)) {
							if (this.config.parseParamFilter?.length) {
								for (const paramFilter of this.config.parseParamFilter ?? []) {
									if (node.getJSONContent()['identifier'] == paramFilter) {
										await this._addMonitoredParameter(node, identifiers)
										return
									}
								}
							} else {
								await this._addMonitoredParameter(node, identifiers)
								return
							}
						}
					}
				} else if (this.config.parseParamFilterString) {
					if (this.config.parseParamFilter?.length) {
						for (const paramFilter of this.config.parseParamFilter ?? []) {
							if (node.getJSONContent()['identifier'] == paramFilter) {
								await this._addMonitoredParameter(node, identifiers)
								return
							}
						}
					}
				} else await this._addMonitoredParameter(node, identifiers)
			} catch (e) {
				this.log('error', 'Failed to subscribe to path "' + identifiers + '": ' + e)
			}
		}
	}

	private async _addMonitoredParameter(paramNode: TreeNode, label: string) {
		this.config.monitoredParameters!.push({ id: paramNode.getJSONContent()['path'] ?? '', label: label })

		this.setVariableDefinitions(GetVariablesList(this.config))

		paramNode.getDirectory((node) => {
			this.handleChangedValue(label, node).catch((e) => this.log('error', 'Error handling parameter ' + e))
		})

		await this.handleChangedValue(label, paramNode)
	}
}

runEntrypoint(EmberPlusInstance, [])
