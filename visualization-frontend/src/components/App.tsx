import * as React from 'react';
import {Component} from 'react';

import Main from './Main';
import Aside from './Aside';
import { Dag, ParsedLine } from '../model/dag';
import SatNode from '../model/sat-node';
import './App.css';
import { assert } from '../model/util';
import { filterNonParents, filterNonConsequences, mergePreprocessing, passiveDagForSelection } from '../model/transformations';
import { findCommonConsequences } from '../model/find-node';
import { VizWrapper } from '../model/viz-wrapper';
import { Clause } from '../model/unit';
import { Literal } from '../model/literal';
import { computeClauseRepresentation, computeParentLiterals } from '../model/clause-orientation';

type Props = {
  problem: string,
  spacerUserOptions: string,
  mode: "proof" | "saturation" | "manualcs"
  hideBracketsAssoc: boolean,
  nonStrictForNegatedStrictInequalities: boolean, 
  orientClauses: boolean,
};

/* Invariant: the state is always in one of the following phases
 *    "loaded": A dag is loaded. Clause selection is not possible. dags, nodeSelection and currentTime hold meaningful values.
 *    "loaded selected": Same as "loaded", but clause selection is possible.
 *    "waiting": Waiting for answer from Vampire server. message holds a meaningful value.
 *    "layouting": Layouting a dag. message holds a meaningful value.
 *    "error": Some error occured. message holds a meaningful value.
 */
type State = {
  state: "loaded" | "loaded select" | "waiting" | "layouting" | "error",
  dags: Dag[],
  nodeSelection: number[],
  currentTime: number,
  changedNodesEvent?: Set<number>, // update to trigger refresh of node in graph. Event is of the form [eventId, nodeId]
  message: string,
  passiveDag: Dag | null,
  nodeIdToActivate: number | null
}

class App extends Component<Props, State> {

  state: State = {
    state: "waiting",
    dags: [],
    nodeSelection: [],
    currentTime: 0,
    changedNodesEvent: undefined,
    message: "",
    passiveDag: null,
    nodeIdToActivate: null
  }

  render() {
    const {
      state,
      dags,
      nodeSelection,
      currentTime,
      changedNodesEvent,
      message,
      passiveDag
    } = this.state;
    
    let dag;
    let main;
    if (state === "loaded" || state === "loaded select") {
      assert(dags.length > 0);
      dag = dags[dags.length-1];
      main = (
        <Main
          dag={dag}
          passiveDag={passiveDag}
          nodeSelection={nodeSelection}
          changedNodesEvent={changedNodesEvent}
          historyLength={dags[0].maximalActiveTime()}
          currentTime={currentTime}
          onNodeSelectionChange={this.updateNodeSelection.bind(this)}
          onCurrentTimeChange={this.updateCurrentTime.bind(this)}
          onDismissPassiveDag={this.dismissPassiveDag.bind(this)}
          onUpdateNodePositions={this.updateNodePositions.bind(this)}
        />
      );
    } else {
      dag = null;
      main = (
        <main>
          <section className="graph-placeholder">{message}</section>
          <section className="slider-placeholder"/>
        </main>
      );
    }

    return (
      <div className="app">
        {main}
        <Aside
          dag={passiveDag === null ? dag : passiveDag}
          currentTime={currentTime}
          nodeSelection={nodeSelection}
          multipleVersions={passiveDag === null && dags.length > 1}
          onUpdateNodeSelection={this.updateNodeSelection.bind(this)}
          onUndo={this.undoLastStep.bind(this)}
          onRenderParentsOnly={this.renderParentsOnly.bind(this)}
          onRenderChildrenOnly={this.renderChildrenOnly.bind(this)}
          onShowPassiveDag={this.showPassiveDag.bind(this)}
          onDismissPassiveDag={this.dismissPassiveDag.bind(this)}
          onSelectParents={this.selectParents.bind(this)}
          onSelectChildren={this.selectChildren.bind(this)}
          onSelectCommonConsequences={this.selectCommonConsequences.bind(this)}
          onLiteralOrientationChange={this.changeLiteralOrientation.bind(this)}
          onLiteralRepresentationChange={this.changeLiteralRepresentation.bind(this)}
        />
      </div>
    );

  }

  async componentDidMount() {

    // call Vampire on given input problem
    await this.runVampire(this.props.problem, this.props.spacerUserOptions, this.props.mode);

    if (this.state.state === "loaded select" && this.props.mode === "manualcs") {
      this.selectFinalPreprocessingClauses();
    }
  }


  // NETWORK ///////////////////////////////////////////////////////////////////////////////////////////////////////////

  updateNodeSelection(nodeSelection: number[]) {
    this.setState({nodeSelection: nodeSelection});
  }

  updateCurrentTime(currentTime: number) {
    const dags = this.state.dags
    assert(dags.length > 0);
    const dag = dags[dags.length - 1];

    const nodesInActiveDag = dag.computeNodesInActiveDag(currentTime);
    const nodeSelection = new Array<number>();
    for (const nodeId of this.state.nodeSelection) {
      if (nodesInActiveDag.has(nodeId)) {
        nodeSelection.push(nodeId);
      }
    }
    this.setState({
      nodeSelection: nodeSelection,
      currentTime: currentTime
    });
  }


  // FILE UPLOAD ///////////////////////////////////////////////////////////////////////////////////////////////////////
  jsonToParsedLines(json: any): Array<ParsedLine> {
    const parsedLines = new Array<ParsedLine>();
    for (const line of json.lines) {
      const statistics = new Map<string,number>();
      for (const key in line.statistics) {
        const val = line.statistics[key];
        if (typeof val === "number"){
          statistics.set(key, val);
        }
      }
      parsedLines.push(new ParsedLine(line.lineType, line.unitId, line.unitString, line.inferenceRule, line.parents, statistics));
    }
    return parsedLines;
  }

  async runVampire(problem: string, spacerUserOptions: string, mode: "proof" | "saturation" | "manualcs") {
    this.setState({
      state: "waiting",
      message: "Waiting for Vampire...",
      dags: [],
      nodeSelection: [],
      currentTime: 0
    });

    const fetchedJSON = await fetch(mode === "manualcs" ? 'http://localhost:5000/spacer/startmanualcs' : 'http://localhost:5000/spacer/start', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: problem, 
        spacerUserOptions: spacerUserOptions
      })
    });

    try {
      const json = await fetchedJSON.json();

      if (json.status === "success") {
        assert(json.vampireState === "running" ||
          json.vampireState === "refutation" ||
          json.vampireState === "saturation" ||
          json.vampireState === "timeout");

        if (mode === "proof") {
          assert(json.vampireState !== "running")
          if (json.vampireState === "saturation") {
            this.setState({
              state: "error",
              message: "Saturation: Vampire saturated, so there exists no proof!",
              dags: [],
              nodeSelection: [],
              currentTime: 0
            });
            return;
          }
          if (json.vampireState === "timeout") {
            this.setState({
              state: "error",
              message: "Timeout: Vampire could not find a proof in the given time!",
              dags: [],
              nodeSelection: [],
              currentTime: 0
            });
            return;
          }
        }
        const parsedLines = this.jsonToParsedLines(json);

        let dag = Dag.fromParsedLines(parsedLines, null);
        dag = mergePreprocessing(dag);

        if (mode === "proof") {
          assert(dag.isRefutation);
          // find empty clause
          for (const node of dag.nodes.values()) {
            if (node.unit.type === "Clause") {
              const clause = node.unit as Clause;
              if (clause.premiseLiterals.length === 0 && clause.conclusionLiterals.length === 0) {

                // filter all non-parents of empty clause
                const relevantIds = new Set<number>();
                relevantIds.add(node.id);
                dag = filterNonParents(dag, relevantIds);
                break;
              }
            }
          }
        }
  
        await VizWrapper.layoutDag(dag, true);

        if (this.props.orientClauses) {
          computeParentLiterals(dag);
          computeClauseRepresentation(dag, null);
        }
        this.setLiteralOptions(dag);

        const state = (mode == "manualcs" && json.vampireState === "running") ? "loaded select" : "loaded";
        this.setState({
          state: state,
          dags: [dag],
          nodeSelection: [],
          currentTime: dag.maximalActiveTime()
        });
      } else {
        assert(json.status === "error");
        const errorMessage = json.message;
        assert(errorMessage !== undefined && errorMessage !== null);
        this.setState({
          state: "error",
          message: errorMessage,
          dags: [],
          nodeSelection: [],
          currentTime: 0
        });
      }
    } catch (error) {
      if (error.name === "SatVisAssertionError") {
        throw error;
      }
      this.setState({
        state: "error",
        message: `Error: ${error["message"]}`,
        dags: [],
        nodeSelection: [],
        currentTime: 0
      });
    }
  }

  // select the clause with id 'selectedId', then compute incremental layout for resulting dag
  async selectClause(selectedId: number, positioningHint: [number, number]) {
    assert(this.state.dags.length >= 1);
    const currentDag = this.state.dags[this.state.dags.length-1];
    const currentDagActiveNodes = currentDag.computeNodesInActiveDag(currentDag.maximalActiveTime()); // needs to be computed before dag is extended, since nodes are shared
    assert(currentDag.mergeMap !== null);

    // ask server to select clause and await resulting saturation events
    const fetchedJSON = await fetch('http://localhost:5000/spacer/select', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({id: selectedId})
    });

    try {
      const json = await fetchedJSON.json();
      if (json.status === "success") {
        const parsedLines = this.jsonToParsedLines(json);

        // extend existing dag with new saturation events from server
        const newDag = Dag.fromParsedLines(parsedLines, currentDag);

        // compute which nodes have been newly generated
        const newDagActiveNodes = newDag.computeNodesInActiveDag(newDag.maximalActiveTime());
        const newNodes = new Map<number, SatNode>();
        for (const [nodeId, node] of newDag.nodes) {
          if(!currentDagActiveNodes.has(nodeId) && newDagActiveNodes.has(nodeId)) {
            newNodes.set(nodeId, node);
          }
        }

        if (newNodes.size > 0) {
          await VizWrapper.layoutNodesAtPosition(newNodes, positioningHint);
        }

        if (this.props.orientClauses) {
          computeParentLiterals(newDag);
          computeClauseRepresentation(newDag, null);
        }
        this.setLiteralOptions(newDag);
  
        const state = json.vampireState === "running" ? "loaded select" : "loaded";
        const nodeSelection = new Array<number>();
        for (const nodeId of newNodes.keys()) {
          nodeSelection.push(nodeId);
        }
        this.setState({
          state: state,
          dags: [newDag],
          nodeSelection: nodeSelection,
          currentTime: newDag.maximalActiveTime(),
        });
      } else {
        assert(json.status === "error");
        const errorMessage = json.message;
        assert(errorMessage !== undefined && errorMessage !== null);
        this.setState({
          state: "error",
          message: errorMessage,
          dags: [],
          nodeSelection: [],
          currentTime: 0
        });
      }
    } catch (error) {
      if (error.name === "SatVisAssertionError") {
        throw error;
      }
      this.setState({
        state: "error",
        message: `Error: ${error["message"]}`,
        dags: [],
        nodeSelection: [],
        currentTime: 0
      });
    }
  }

  async selectFinalPreprocessingClauses() {
    // iterate as long as the server waits for clause selections and as long as a suitable clause is found
    let stop = false;
    while (this.state.state === "loaded select" && !stop) {
      const dag = this.state.dags[0];

      // find a final preprocessing clause which can be selected
      stop = true;
      for (const [nodeId, node] of dag.nodes) {
        if (node.isFromPreprocessing && node.newTime !== null) {
          if (node.activeTime === null && node.deletionTime === null) {
            // select that clause
            assert(node.position !== null);
            await this.selectClause(nodeId, node.position as [number, number]);
            stop = false;
            break;
          }
        }
      }
    }
  }

  // SUBGRAPH SELECTION ////////////////////////////////////////////////////////////////////////////////////////////////

  undoLastStep() {
    this.popDag();
  }

  async renderParentsOnly() {
    const {dags, nodeSelection} = this.state;
    const currentDag = dags[dags.length - 1];

    const newDag = filterNonParents(currentDag, new Set(nodeSelection));
    await VizWrapper.layoutDag(newDag, true);

    this.pushDag(newDag);
  }

  async renderChildrenOnly() {
    const {dags, nodeSelection} = this.state;
    const currentDag = dags[dags.length - 1];

    const newDag = filterNonConsequences(currentDag, new Set(nodeSelection));
    await VizWrapper.layoutDag(newDag, true);

    this.pushDag(newDag);
  }

  // PASSIVE DAG ////////////////////////////////////////////////////////////////////////////////////////////////////

  async showPassiveDag() {
    assert(this.state.passiveDag === null);
    assert(this.state.nodeSelection.length > 0);

    const dags = this.state.dags;
    assert(dags.length > 0);
    const currentDag = dags[dags.length - 1];

    // generate passive dag
    const passiveDag = passiveDagForSelection(currentDag, this.state.nodeSelection, this.state.currentTime);
    
    // layout node positions of passive dag
    await VizWrapper.layoutDag(passiveDag, false);

    // shift dag so that selected node occurs at same screen position as in currentDag
    const [posCurrentX, posCurrentY] = currentDag.get(this.state.nodeSelection[0]).getPosition();
    const [posPassiveX, posPassiveY] = passiveDag.get(this.state.nodeSelection[0]).getPosition();
    const deltaX = posCurrentX-posPassiveX;
    const deltaY = posCurrentY-posPassiveY;
    for (const [nodeId, node] of passiveDag.nodes) {
      assert(node.position != null);
      const position = node.position as [number, number];
      node.position = [position[0] + deltaX, position[1] + deltaY];
    }

    this.setState({ passiveDag: passiveDag });
  }

  async dismissPassiveDag(performActivation: boolean) {
    assert(this.state.dags.length >= 1);
    assert(this.state.passiveDag !== null);
    assert(this.state.passiveDag!.isPassiveDag);
    assert(this.state.passiveDag!.styleMap !== null);
    assert(this.state.passiveDag!.activeNodeId !== null);

    if (performActivation && this.state.nodeSelection.length === 1) {
      const selectedId = this.state.nodeSelection[0];

      const styleMap = this.state.passiveDag!.styleMap!
      if (styleMap.get(selectedId) === "passive") {
        // compute positioning hint
      const currentDag = this.state.dags[this.state.dags.length-1];
      const positioningHint = currentDag.get(this.state.passiveDag!.activeNodeId as number).position;
      assert(positioningHint !== null);
    
      // remove passive dag
      this.setState({ passiveDag: null}); // no need to reset node selection, since it will be set by selectClause()

      // switch from currentDag to dag resulting from selecting nodeIdToActivate
      await this.selectClause(selectedId, positioningHint as [number, number]);
      }
    } else {
      // remove passive dag
      this.setState({ passiveDag: null, nodeSelection: []}); // reset node selection, since selected nodes are not necessarily present in currentDag
    }
  }


  // NODE SELECTION ////////////////////////////////////////////////////////////////////////////////////////////////////

  selectParents() {
    const {dags, nodeSelection, currentTime} = this.state;
    const currentDag = dags[dags.length - 1];
    const nodesInActiveDag = currentDag.computeNodesInActiveDag(currentTime);

    const newSelection = new Set(nodeSelection);
    for (const nodeId of nodeSelection) {
      assert(nodesInActiveDag.has(nodeId));
      for (const parentId of currentDag.get(nodeId).parents) {
        if(nodesInActiveDag.has(parentId)) {
          newSelection.add(parentId);
        }
      }
    }

    this.updateNodeSelection(Array.from(newSelection));
  }

  selectChildren() {
    const {dags, nodeSelection, currentTime} = this.state;
    const currentDag = dags[dags.length - 1];
    const nodesInActiveDag = currentDag.computeNodesInActiveDag(currentTime);

    const newSelection = new Set(nodeSelection);
    for (const nodeId of nodeSelection) {
      assert(nodesInActiveDag.has(nodeId));
      for (const childId of currentDag.getChildren(nodeId)) {
        if(nodesInActiveDag.has(childId)) {
          newSelection.add(childId);
        }
      }
    }
    this.updateNodeSelection(Array.from(newSelection));
  }

  selectCommonConsequences() {
    const {dags, nodeSelection, currentTime} = this.state;
    const currentDag = dags[dags.length - 1];
    const nodesInActiveDag = currentDag.computeNodesInActiveDag(currentTime);

    const commonConsequences = findCommonConsequences(currentDag, new Set(nodeSelection));
    const newSelection = new Array<number>();
    for (const nodeId of commonConsequences) {
      if (nodesInActiveDag.has(nodeId)) {
        newSelection.push(nodeId);
      }
    }
    this.updateNodeSelection(newSelection);
  }

  // LITERALS ////////////////////////////////////////////////////////////////////////////////////////////////////////

  private changeLiteralOrientation(nodeId: number, oldPosition: ["premise" | "conclusion" | "context", number], newPosition: ["premise" | "conclusion" | "context", number]) {
    const dags = this.state.dags;
    assert(dags.length > 0);
    const dag = dags[0];
    const currentDag = dags[dags.length - 1];
    const node = dag.nodes.get(nodeId);
    assert(node !== undefined);
    assert(node!.unit.type === "Clause");
    const clause = node!.unit as Clause;

    clause.changeLiteralOrientation(oldPosition, newPosition);

    const changedNodes = computeClauseRepresentation(dag, nodeId);
    const changedNodesInCurrentDag = new Set<number>();
    for (const changedNodeId of changedNodes) {
      if (currentDag.nodes.has(changedNodeId)) {
        changedNodesInCurrentDag.add(changedNodeId);
      }
    }
    this.setState({changedNodesEvent: changedNodesInCurrentDag});
  }

  private changeLiteralRepresentation(nodeId: number, literal: Literal) {
    const dags = this.state.dags;
    assert(dags.length > 0);
    const dag = dags[0];
    const node = dag.nodes.get(nodeId);
    assert(node !== undefined);

    literal.switchToNextRepresentation();
    
    const changedNodes = computeClauseRepresentation(dag, nodeId);

    this.setState({changedNodesEvent: changedNodes});
  }

  // HELPERS ///////////////////////////////////////////////////////////////////////////////////////////////////////////
  
  updateNodePositions(nodeIds: Array<number>, delta: [number, number]) {
    const dags = this.state.dags
    assert(this.state.dags.length > 0);
    const dag = dags[dags.length - 1];
    for (const nodeId of nodeIds) {
      const node = dag.get(nodeId);
      assert(node.position !== null);
      node.position = [node.position![0] + delta[0], node.position![1] + delta[1]];
    }
  }

  // push a new dag on the stack of dags
  // Precondition: the layout for newDag has already been computed
  private pushDag(newDag: Dag) {
    assert(!newDag.isPassiveDag);

    const {dags, nodeSelection} = this.state;
    
    // filter out selected nodes which don't occur in new graph
    const selectedNodesInNewDag = new Array<number>();
    for (const nodeId of nodeSelection) {
      if (newDag.nodes.has(nodeId)) {
        selectedNodesInNewDag.push(nodeId);
      }
    }

    this.setState({
      dags: dags.concat([newDag]),
      nodeSelection: selectedNodesInNewDag
    });
  }

  private popDag() {
    assert(this.state.dags.length > 1, "Undo last step must only be called if there exist at least two dags");

    this.setState((state, props) => ({
      dags: state.dags.slice(0, state.dags.length-1)
    }));
  }

  setLiteralOptions(dag: Dag) {
    const hideBracketsAssoc = this.props.hideBracketsAssoc;
    const nonStrictForNegatedStrictInequalities = this.props.nonStrictForNegatedStrictInequalities;

    for (const node of dag.nodes.values()) {
      if (node.unit.type === "Clause") {
        const clause = node.unit as Clause;
        for (const literal of clause.premiseLiterals) {
          literal.hideBracketsAssoc = hideBracketsAssoc;
          literal.nonStrictForNegatedStrictInequalities = nonStrictForNegatedStrictInequalities;
        }
        for (const literal of clause.conclusionLiterals) {
          literal.hideBracketsAssoc = hideBracketsAssoc;
          literal.nonStrictForNegatedStrictInequalities = nonStrictForNegatedStrictInequalities;
        }
      }
    }
  }
}

export default App;
