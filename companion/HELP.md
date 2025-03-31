# STAGETEC Ember+ Generic
Credits to the developers of the generic Ember+ module for the basis (https://github.com/bitfocus/companion-module-generic-emberplus)

 Features:
 * AutoParse any Ember+ device tree and filter for specific nodes and parameters.
 * Set specific sub-paths for AutoParse to only scan nodes and parameters below subpath
 * Set values of Ember+ Parameters and get feedback from Ember+ Parameters.
 * Set specific paths to subscribe to Ember+ Parameters.
 
 Differences to generic Ember+ module:
 * Auto parsing of Ember+ tree available
 * Additional actions available: increment, decrement, toggle boolean and set value with expression
 * Additional feedbacks available: hit threshold, below threshold and boolean equal
 * Different Ember+ library is used: node-emberplus. Reason: for Ember+ matrix extension node paths starting with values > 0 are necessary.

 Remark:
 * Not compatible with Matrix Ember+ trees of NEXUS Modular
  

## Version History

### 0.9.1 BETA 
 * Initial version
 * Only tested with the following Ember+ trees: Nexus Compact, Nexus Modular (standard)
 
### 1.0.0
 * official Release 
  
