import * as React from 'react';

import '../styles/NodeDetails.css';
import '../styles/Editor.css';
import {toDiff} from "../helpers/diff";
import {lemmaColours} from "../helpers/network";
import {getCleanExprList} from "../helpers/readable";
import Modal from 'react-modal';
import {EditorModal} from './EditorModal';
type Props = {
    nodes: any,
    expName: string
    PobLemmasMap: {},
    ExprMap: {},
    layout: string,
    expr_layout: "SMT" | "JSON",
    saveExprs: () => void,
    relatedExprMap: any,
    solvingCompleted: boolean
};

type State = {
    learningFlag: boolean,
    learningErrorFlag: boolean,
    transformationFlag: boolean
    transformationErrorFlag: boolean
    possibleTransformations: {humanReadableAst: string, xmlAst: string}[]
    transformationSelected: string,
    editorIsOpen: boolean,
    editorTextInputList: string[],
}

export default class NodeDetails extends React.Component<Props, State> {

    keep = false; // hack to skip each second event generated by Sortable
    constructor(props) {
        super(props);
        this.state = {
            learningFlag: false,
            learningErrorFlag: false,
            transformationFlag: false,
            transformationErrorFlag: false,
            possibleTransformations: [],
            transformationSelected: "",
            editorIsOpen: false,
            editorTextInputList: [],
        }
    }

    type_map = {
        "EQUALS": "= ",
        "PLUS": "+ ",
        "TIMES": "* ",
        "LT": "< ",
        "LE": "<= ",
        "GT": "> ",
        "GE": ">= ",
        "SYMBOL": "",
        "0_REAL_CONSTANT": ""
    };

    node_to_string(n: Object, is_root: Boolean):string{
        let result: string;
        let args = "";
        const nl = is_root?"\n":"";
        //build args 
        if (Array.isArray(n["content"])){
            for(const arg of n["content"]){
                args+=this.node_to_string(arg, false)+nl
            }
        }else{
            args+=n["content"]
        }
        //build node
        if (n["type"] in this.type_map){
            if(this.type_map[n["type"]]===""){
                result = " "+ args
            }else{
                result = "(" + this.type_map[n["type"]] + args + ")"
            }
        }else{
            result = "(" + n["type"] + nl + args + ")"
        }
        return result
    }

    getLemmaExprs(node): string[]{
        /*
        Convert all lemmas under a pob to input to Editor
        */
        let lemmaExprs = new Array<string>();
        if (node.event_type === "EType.EXP_POB") {
            if (node.exprID in this.props.PobLemmasMap){
                let lemmas = this.props.PobLemmasMap[node.exprID];
                for (const lemma of lemmas){
                    let expr = this.props.ExprMap[lemma[0]];
                    lemmaExprs.push(expr["raw"]);
                }
            }
        }
        return lemmaExprs;
    }

    getLemmaList(node) {
        let lemma_list: JSX.Element[] = [];
        if (node.event_type === "EType.EXP_POB") {
            lemma_list.push(<h2 key ="lemma-title"> Lemmas summarization </h2>);
            if (node.exprID in this.props.PobLemmasMap){
                let lemmas = this.props.PobLemmasMap[node.exprID];
                console.log(lemmas);
                for (const lemma of lemmas){
                    let colorIndex = lemmas.indexOf(lemma);
                    let lemmaStyle = {
                        color: lemmaColours[colorIndex]
                    };
                    lemma_list.push(<h3 style={lemmaStyle} key={"lemma-header-"+ lemma[0]}>ExprID: {lemma[0]}, From: {lemma[1]} to {lemma[2]}</h3>);
                    let expr = this.props.ExprMap[lemma[0]].editedReadable;
                    if (typeof expr === "string"){
                        if (Object.keys(this.props.relatedExprMap).length > 0){
                            let keys = Object.keys(this.props.relatedExprMap);
                            for (let i = 0; i < keys.length; i++){
                                let exprData = this.props.relatedExprMap[keys[i]];
                               if (expr === exprData.editedReadable) {
                                   expr = exprData.editedReadable;
                                   break;
                               }
                            }
                        }
                        let exprList = getCleanExprList(expr, "\n");
                        let implies = -1;
                        for (let i = 0; i < exprList.length; i++){
                            if (exprList[i].includes("=>")){
                                implies = i;
                                break;
                            }
                        }
                        exprList.forEach((literal, key) => {
                            let lemmaColour = {
                                color: "black"
                            }
                            if (implies !== -1) {
                                if (key > implies) {
                                    lemmaColour.color = "darkblue";
                                }
                            }
                            lemma_list.push(<pre style={lemmaColour} key={"lemma-expr-" + lemma[0] + key}>{literal}</pre>);
                        });
                    }
                    else {
                        lemma_list.push(<pre>{expr}</pre>);
                    }
                }
            }
        }
        return lemma_list;
    }
    
    async transformExprsFromText(t: string) {
        //wrapper around transformExprs to take in a string instead of reading transformationSelected from state
        this.setState({
            transformationSelected: t
        }, ()=>this.transformExprs());
    }

    async transformExprs() {
        this.setState({
            transformationFlag: false,
            transformationErrorFlag: false
        });
        const response = await fetch("http://localhost:5000/spacer/apply_transformation", {
            method: 'POST',
            mode :'cors',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }, body : JSON.stringify({
                expName: this.props.expName,
                selectedProgram: this.state.transformationSelected
            })
        });

        if (response.status === 200){
            this.closeModal();
            let responseData = await response.json();
            let tExprMap = responseData["response"];
            Object.keys(tExprMap).forEach((key) => {
                this.props.ExprMap[key].editedRaw = tExprMap[key]['raw'];
                this.props.ExprMap[key].editedReadable = tExprMap[key]['readable'];
            });
            this.props.saveExprs();
            this.setState({
                transformationFlag: true,
            });
            this.forceUpdate();
        }
        else {
            this.setState({
                transformationErrorFlag: true
            });
        }
    }
    
    openModal() {
        let editorTextInputList = this.getLemmaExprs(this.props.nodes[0]);
        this.setState({editorIsOpen: true, editorTextInputList: editorTextInputList});
    }

    afterOpenModal() {
        // references are now sync'd and can be accessed.
    }

    closeModal() {
        this.setState({editorIsOpen: false});
    }

    render() {
        let node1, node2;
        
        if (this.props.nodes.length > 1){
            node1 = this.props.nodes[0];
            node2 = this.props.nodes[1];
        }
        return (
            <div>
                {/* Editor modal */}
                <Modal
                    isOpen={this.state.editorIsOpen}
                    onRequestClose={this.closeModal.bind(this)}
                    overlayClassName="editor-modal"
                    contentLabel="Example Modal"
                >
                    <h2>Editor</h2>
                    <button onClick={this.closeModal.bind(this)}>Close</button>
                    <EditorModal
                        expName={this.props.expName}
                        inputList={this.state.editorTextInputList}
                        onTransformExprs = {this.transformExprsFromText.bind(this)}
                        saveExprs={this.props.saveExprs.bind(this)}
                    />
                </Modal>

                {this.props.nodes.length > 1 && <section className='component-node-details details-diff'>
                    <article>
                        <h2>Diff (Node: <strong>{node1.nodeID}</strong> vs. Node: <strong>{node2.nodeID}</strong>)</h2>
                        {toDiff(node1.expr.editedReadable, node2.expr.editedReadable).map((part, key) => (
                            <span key={key} className={part.added ? "green" : part.removed ? "red" : "black"}>
                                {part.value}
                            </span>
                        ))}
                    </article>
                </section>}
                {this.props.nodes.map((node, key) => {
                    let additional_info ="type:" + node.event_type + " level:" + node.level;
                    let lemma_list = this.getLemmaList(node);

                    let expr = this.props.ExprMap[node.exprID].editedReadable;

                    const classNameTop = "component-node-details details-top-" + key;
                    const classNameBottom = "component-node-details details-bottom-" + key;
                    return (
                        <div key = {key}>
                            <section className={classNameTop}>
                                <article>
                                    <h2>Node <strong>{node.nodeID}, </strong>Expr <strong> {node.exprID} </strong>,
                                        Parent <strong> {node.pobID}  </strong></h2>
                                    <h3>{additional_info}</h3>
                                    <pre className={this.props.nodes.length === 1 ? "black" : node === node1 ? "red" : "green" }>{expr}</pre>
                                </article>
                            </section>
                            {lemma_list.length > 0 && <section className={classNameBottom}>
                                <article>
                                    {lemma_list}

                                    {this.props.solvingCompleted?
                                    <button onClick={this.openModal.bind(this)}>Open Editor</button>
                                    : ""}
                                </article>
                            </section>}
                        </div>
                    );
                })}
            </div>
        );
    }
}
