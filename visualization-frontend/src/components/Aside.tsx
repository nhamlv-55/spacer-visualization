import * as React from 'react';

import '../styles/NodeMenu.css';
import NodeDetails from './NodeDetails';
import { inOutExample, ITreeNode, IExprMap} from "../helpers/datatypes";
const icons = require('../resources/icons/all.svg') as string;

type Props = {
    tree: {[nodeID: number]: ITreeNode},
    nodeSelection: number[],
    onUpdateNodeSelection: (selection: number[]) => void,
    onPoke: () => void,
    onOpenStarModal: () => void,
    SatVisLayout: () => void,
    PobVisLayout: () => void,
    MultiSelectMode: () => void,
    SMTLayout: () => void,
    JSONLayout:() => void,
    PobLemmasMap: {},
    ExprMap: IExprMap,
    layout: string,
    expr_layout: "SMT"|"JSON",
    expName: string,
    solvingCompleted: boolean
    onAddInputOutputExample: (example: inOutExample)=>void,
    onPushToMessageQ: (channel: string, msg: string)=>void,
};

type State = {
    relatedExprMap: any
}

class Aside extends React.Component<Props, State> {
    constructor(props: Props){
        super(props);
        this.state = {
            relatedExprMap: []
        }
    }

    createButton(title: string, onClick: ()=>void, svg: string) {
        return <button
                   title={title}
                   onClick = { onClick }
               >
            <svg viewBox="0 0 24 24" className = "icon big" >
                <use xlinkHref={ `${icons}#${svg}` } />
            </svg>
        </button>;
    }
    getNodeDetails() {
        if (this.props.nodeSelection.length >= 1  && this.props.tree != null) {
            let nodes: ITreeNode[] = [];
            for (let node of this.props.nodeSelection){
                nodes.push(this.props.tree[node]);
            }
            return <NodeDetails
                       nodes={nodes}
                       expName={this.props.expName}
                       PobLemmasMap = { this.props.PobLemmasMap }
                       ExprMap = { this.props.ExprMap }
                       layout = { this.props.layout }
                       expr_layout ={this.props.expr_layout}
                       relatedExprMap = {this.state.relatedExprMap}
                       solvingCompleted = {this.props.solvingCompleted}
                       onAddInputOutputExample ={this.props.onAddInputOutputExample.bind(this)}
                       onPushToMessageQ={this.props.onPushToMessageQ.bind(this)}
            />;
        } else {
            return <section className={ 'component-node-details overview' }>
                <small id="nodeInfo" > <strong>{`${this.props.nodeSelection.length} nodes`
                } </strong> selected</small >
            </section>
        }
    }
    updateRelatedExprMap(exprMap: IExprMap) {
        this.setState({
            relatedExprMap: exprMap 
        });
    }

    render() {
        return(
            <aside>
                <article>
                    <section className="component-node-menu" >
                        { this.createButton("Poke", this.props.onPoke, "graph-undo") }
                        { this.createButton("Star", this.props.onOpenStarModal, "star") }
                        { this.createButton("SatVis", this.props.SatVisLayout, "node-parents") }
                        { this.createButton("PobVis", this.props.PobVisLayout, "node-children") }
                        { this.createButton("MultiSelect", this.props.MultiSelectMode, "history-forward") }
                        {/* <button
                            title = "SMT"
                            onClick = { this.props.SMTLayout }
                            >
                            <svg viewBox="0 0 30 30" className = "icon big" >
                            <text x="50%" alignmentBaseline="middle" textAnchor="middle" y="50%" dominantBaseline="middle" fontWeight="light" stroke="none" fill="black" fontFamily="monospace">Raw</text>
                            </svg>
                            </button>
                            <button
                            title = "JSON"
                            onClick = { this.props.JSONLayout }
                            >
                            <svg viewBox="0 0 35 35" className = "icon big" >
                            <text x="50%" alignmentBaseline="middle" textAnchor="middle" y="50%" dominantBaseline="middle" fontWeight="light" stroke="none" fill="black" fontFamily="monospace">Sort</text>
                            </svg>
                            </button> */}
                    </section>
                </article>
                { this.getNodeDetails() }
                   </aside>
        );
    }

}
export default Aside; 
