import * as React from 'react';
import { Component } from 'react';

import Main from './Main';
import Aside from './Aside';
import {StarModal} from './StarModal';
import '../styles/App.css';
import { assert } from '../model/util';
import {buildExprMap, buildPobLemmasMap} from "../helpers/network";
import {replaceVarNames, toReadable} from "../helpers/readable";

import Modal from 'react-modal';
type Props = {
    expName: string,
};

type State = {
    expName: string,
    state: "loaded" | "loaded iterative" | "waiting" | "layouting" | "error",
    trees: any[],
    runCmd: string,
    messages_q: string[],
    nodeSelection: number[],
    currentTime: number,
    layout: string,
    expr_layout: "SMT" | "JSON",
    PobLemmasMap: {},
    ExprMap: {},
    multiselect: boolean,
    varNames: string,
    starModalIsOpen: boolean,
    solvingCompleted: boolean,
    dumbReplaceMap: {}
}

class App extends Component<Props, State> {

    state: State = {
        expName: this.props.expName,
        state: "waiting",
        trees: [],
        runCmd: "Run command:",
        messages_q: [""],
        nodeSelection: [],
        currentTime: 0,
        layout: "PobVis",
        expr_layout: "SMT",
        PobLemmasMap: {},
        ExprMap: {},
        multiselect: false,
        varNames: "",
        starModalIsOpen: false,
        solvingCompleted: false,
        dumbReplaceMap: {}
    };

    async componentDidMount() {
        await this.poke();
    }

    async poke() {
        let message_q = ["Poking Spacer..."];

        console.log("poking...")
        this.setState({
            state: "waiting",
            messages_q: message_q,
        });

        const fetchedJSON = await fetch('http://localhost:5000/spacer/poke', {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }, body : JSON.stringify({
                expName: this.state.expName,
            })
        });

        try {
            const json = await fetchedJSON.json();
            console.log("backend response:", json);
            message_q = ["Get response from Backend."]
            let tree = json.nodes_list;
            for (let i = 0; i < Object.keys(tree).length; i++){
                let rawWithVars = replaceVarNames(tree[i].expr, json.var_names);
                let readable = toReadable(rawWithVars);
                tree[i].expr = {
                    raw: rawWithVars,
                    readable: readable,
                    editedRaw: rawWithVars,
                    editedReadable: readable
                };
            }
            const state = "loaded";
            const PobLemmasMap = buildPobLemmasMap(tree, json.var_names);
            // NOTE: use varNames in state, not in props. The one in state is returned by the backend.
            let ExprMap;
            if (Object.keys(json.expr_map).length === 0) {
                ExprMap = buildExprMap(tree, json.var_names);
            }
            else {
                ExprMap = json.expr_map;
            }

            this.setState({
                trees: [tree],
                runCmd: json.run_cmd,
                messages_q: ["Spacer is "+json.spacer_state],
                state: state,
                PobLemmasMap: PobLemmasMap,
                ExprMap: ExprMap,
                varNames: json.var_names,
                solvingCompleted: !(json.spacer_state === "running")
            });
            console.log("state is set")
        } catch (error) {
            if (error.name === "SatVisAssertionError") {
                throw error;
            }
            this.setState({
                state: "error",
                messages_q: [`Error: ${error["message"]}`],
                solvingCompleted: false,
            });
        }
    }

    async saveExprMap() {
        await fetch('http://localhost:5000/spacer/save_exprs', {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }, body : JSON.stringify({
                expName: this.state.expName,
                expr_map: JSON.stringify(this.state.ExprMap)
            })
        });
    }

    updateNodeSelection(nodeSelection: number[]) {
        if (this.state.multiselect) {
            let tempNodeSelection = this.state.nodeSelection.slice(this.state.nodeSelection.length-1).concat(nodeSelection);
            this.setState({nodeSelection: tempNodeSelection});
        } else {
            this.setState({nodeSelection: nodeSelection});
        }
    }
    
    updateCurrentTime(currentTime: number) {
        const trees = this.state.trees;
        assert(trees.length > 0);
        this.setState({
            currentTime: currentTime
        });
    }

    setPobVisLayout(){
        this.setState({ layout: "PobVis" })
    }
    setSatVisLayout(){
        this.setState({ layout: "SatVis" })
    }
    setMultiSelect() {
        if (this.state.multiselect) {
            if (this.state.nodeSelection.length > 0) {
                this.setState({
                    nodeSelection: [this.state.nodeSelection[this.state.nodeSelection.length - 1]]
                });
            }
            else {
                this.setState({
                    messages_q: ["Hit Poke to update graph"]
                })
            }
        } else {
            this.setState({
                messages_q: ["Select Up to 2 nodes"]
            });
        }
        this.setState({
            multiselect: !this.state.multiselect
        });
    }
    setSMTLayout(){
        this.setState({ expr_layout: "SMT" })
    }
    setJSONLayout(){
        this.setState({ expr_layout: "JSON" })
    }

    openStarModal(){
        this.setState({starModalIsOpen: true});
    }

    closeStarModal(){
        this.setState({starModalIsOpen: false});
    }

    render() {
        const {
            state,
            trees,
            runCmd,
            messages_q,
            nodeSelection,
            currentTime,
            layout,
            expr_layout,
            PobLemmasMap,
            ExprMap,
            dumbReplaceMap
        } = this.state;
        let tree;
        let main;
        if (state === "loaded") {
            assert(trees.length > 0);
            tree = trees[trees.length - 1];
            const hL = Object.keys(tree).length;
            main = (
                <Main
                    runCmd = {runCmd}
                    tree = { tree }
                    onNodeSelectionChange = { this.updateNodeSelection.bind(this) }
                    nodeSelection = { nodeSelection }
                    historyLength = { hL }
                    currentTime = { currentTime }
                    onCurrentTimeChange = { this.updateCurrentTime.bind(this) }
                    layout = { layout }
                    PobLemmasMap = { PobLemmasMap }
                    solvingCompleted = {this.state.solvingCompleted}
                />
            );
        } else {
            main = (
                <main >
                    <section className= "slider-placeholder" />
                </main>
            );
        }
        return (
            <div className= "app" >
                <Modal
                    isOpen={this.state.starModalIsOpen}
                    onRequestClose={this.closeStarModal.bind(this)}
                    overlayClassName="editor-modal"
                    contentLabel="Example Modal"
                >
                    <h2>Final invariant</h2>
                    <button onClick={this.closeStarModal.bind(this)}>Close</button>
                    <StarModal
                        expName = {this.props.expName}
                        PobLemmasMap = {this.state.PobLemmasMap}
                        ExprMap = {this.state.ExprMap}
                    />
                </Modal>
                { main }
                <Aside
                    messages_q = {messages_q}
                    tree = { tree }
                    nodeSelection = { nodeSelection }
                    onUpdateNodeSelection = { this.updateNodeSelection.bind(this) }
                    onPoke = {this.poke.bind(this)}
                    onOpenStarModal = {this.openStarModal.bind(this)}
                    SatVisLayout = { this.setSatVisLayout.bind(this) }
                    PobVisLayout = { this.setPobVisLayout.bind(this) }
                    MultiSelectMode= { this.setMultiSelect.bind(this) }
                    SMTLayout = { this.setSMTLayout.bind(this) }
                    JSONLayout = { this.setJSONLayout.bind(this) }
                    PobLemmasMap = { PobLemmasMap }
                    ExprMap = { ExprMap }
                    layout = { layout }
                    expr_layout ={expr_layout}
                    saveExprs = {this.saveExprMap.bind(this)}
                    expName = {this.state.expName}
                    solvingCompleted = {this.state.solvingCompleted}
                />
                </div>
        );

    }

}

export default App;
