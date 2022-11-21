import React from 'react';

function About() {


    return(
        <div className="container">
            <div className="row h-100 justify-content-center align-items-center">
                <div className="col-12 col-md-6">
                    <h2>Our History</h2>
                    <p>Started in 2010, Ristorante con Fusion quickly established itself as a culinary icon par excellence in Hong Kong. With its unique brand of world fusion cuisine that can be found nowhere else, it enjoys patronage from the A-list clientele in Hong Kong.  Featuring four of the best three-star Michelin chefs in the world, you never know what will arrive on your plate the next time you visit us.</p>
                    <p>The restaurant traces its humble beginnings to <em>The Frying Pan</em>, a successful chain started by our CEO, Mr. Peter Pan, that featured for the first time the world's best cuisines in a pan.</p>
                </div>
            </div>
            <div className="row h-100 justify-content-center align-items-center">

                <div className="col-12 col-md-6">
                <h2>Corporate Leadership</h2>
                <dl>
                    <dt className="col-12">Started</dt>
                    <dd className="col-12">3 Feb. 2013</dd>
                    <dt className="col-12">Major Stake Holder</dt>
                    <dd className="col-12">HK Fine Foods Inc.</dd>
                    <dt className="col-12">Last Year's Turnover</dt>
                    <dd className="col-12">$1,250,375</dd>
                    <dt className="col-12">Employees</dt>
                    <dd className="col-12">40</dd>
                </dl>
                </div>
            </div>
        </div>
    );
}

export default About;
