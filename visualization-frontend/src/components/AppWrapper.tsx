import * as React from 'react';
import { NavigationBar } from "./NavigationBar";
import App from "./App";
import './AppWrapper.css';

type Props = {
	name: string,
	problem: string,
	spacerUserOptions: string,
	mode: "proof" | "saturation" | "manualcs"
	hideBracketsAssoc: boolean,
	nonStrictForNegatedStrictInequalities: boolean, 
	orientClauses: boolean,
  };
  
  export class AppWrapper extends React.Component<Props, {}> {
	
	render() {
		return (
			<div id="appWrapper">
				<NavigationBar 
					name={this.props.name}
				/>
				<App 
					problem={this.props.problem}
					spacerUserOptions={this.props.spacerUserOptions}
					mode={this.props.mode}
					hideBracketsAssoc={this.props.hideBracketsAssoc}
					nonStrictForNegatedStrictInequalities={this.props.nonStrictForNegatedStrictInequalities}
					orientClauses={this.props.orientClauses}
				/>
			</div>
		)
	}
  }
  
