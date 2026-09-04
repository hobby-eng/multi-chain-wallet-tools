declare const sdk: any;
sdk.documents.create(document);
sdk.contracts.publish(contract);
sdk.tokens.transfer(tokens);
sdk.dpns.registerName(name);
sdk.voting.masternodeVote(vote);
sdk.stateTransitions.broadcastStateTransition(transition);
sdk.stateTransitions.broadcastAndWaitForAffectedState(transition);
