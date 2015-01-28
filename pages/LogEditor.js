/**
 * @jsx React.DOM
 */

var React = require('react');
var $ = require('jquery');
var numeral = require('numeral');
var Router = require('react-router');
var _ = require('lodash');
require('../libs/bootstrap-datepicker');
var Link = Router.Link;
/* Components */
var remoteStorage = require('../components/storage.remote');
var Moment = require('moment');
var LogEditor = require('../components/editor/LogEditor');
var SearchBox = require('../components/SearchBox');
var Moment = require('moment');
var Notify = require('../components/Notify');
var Progress = require('../components/Progress');
var SetIntervalMixin = require('../components/mixins/setInterval');
var DataAPI = require('../utils/DataAPI');
var BindStore = require('../mixins/BindStore');

/** Store */
var ProjectStore = require('../stores/ProjectStore');

var Ltt = global.Ltt;

var DATE_FORMAT = 'YYYY-MM-DD';


var Page = React.createClass({

    mixins: [SetIntervalMixin],

    getInitialState: function () {
        return {
            current: new Moment().format(DATE_FORMAT),
            projects: []
        };
    },

    render: function () {
        var days = this.state.days;
        console.log('########render');
        return (
            <div className="ltt_c-page ltt_c-page-logEditor">
                <LogEditor title={this.state.current}
                    onNextDay={this.openNextDay}
                    onPrevDay={this.openPrevDay}
                    onChange={this.onChange}
                    onLoad={this.onEditorLoad}
                    ref="logEditor"/>
                <aside>
                    <LogDatePicker select={this.state.current}
                        onDateChange={this.onDateChange}
                        ref="datePicker"/>
                    <div className="lastTime" ref="lastTime"></div>
                    <div className="ltt_c-sidebar-splitline">Projects</div>
                    <ProjectInfo date={this.state.current}/>
                </aside>
            </div>
        );
    },

    onDateChange: function (date) {
        console.log('date change');
        date = new Moment(date).format(DATE_FORMAT)
        this.setState({
            current: date
        });
    },

    openPrevDay: function () {
        var prevDay = new Moment(this.state.current).subtract(1, 'day')
        this.setState({
            current: prevDay.format(DATE_FORMAT)
        });
    },

    openNextDay: function () {
        var next = new Moment(this.state.current).add(1, 'day')
        this.setState({
            current: next.format(DATE_FORMAT)
        });
    },


    onChange: function (content) {
        var doingLog = this.refs.logEditor.getDoingLog(this.state.current, content);
        this.updateLastTime(doingLog);
    },

    onEditorLoad: function (content) {
        var doingLog = this.refs.logEditor.getDoingLog(this.state.current, content);
        this.updateLastTime(doingLog);
    },

    updateLastTime: function (doingLog) {
        var lastTime = this.refs.lastTime.getDOMNode();
        tickTime(doingLog);
        if (this.updateTimeIntervalId) {
            this.clearInterval(this.updateTimeIntervalId);
        }
        this.updateTimeIntervalId = this.setInterval(function () {
            tickTime(doingLog);
        }, 1000);

        function tickTime(doingLog) {
            var content, name;
            if (doingLog) {
                var lastSeconds = new Moment().diff(new Moment(doingLog.start), 'second');
                var task = doingLog.task,
                    project = doingLog.projects[0],
                    subTask = doingLog.subTask,
                    tag = (doingLog.tags || []).join(',');
                if (tag) {
                    name = '[' + tag + '] ';
                }
                if (project) {
                    name = project.name
                }
                if (task) {
                    name += ' ' + task.name;
                }
                if (subTask) {
                    name += ' ' + subTask.name;
                }
                content = (
                    <div className="ltt_c-lastTime">
                        <span className="ltt_c-lastTime-name">
                            {name}
                        </span>
                        <span className="ltt_c-lastTime-time">{numeral(lastSeconds).format('00:00:00')}</span>
                    </div>
                );
            } else {
                content = <i></i>;
            }
            React.renderComponent(content, lastTime);
        }
    }
});

var LogDatePicker = React.createClass({
    render: function () {
        return (
            <div className="ltt_c-page-logEditor-datepicker"></div>
        );
    },

    setDate: function (date) {
        $(this.getDOMNode()).datepicker('setDate', this.props.select);
    },

    componentDidMount: function () {
        var onDateChange = this.props.onDateChange;
        $(this.getDOMNode())
        .datepicker({
            todayHighlight: true,
            format: "yyyy-mm-dd",
            calendarWeeks: true
        })
        .on('changeDate', function (e) {
            var date = e.date;
            onDateChange(date);
        }).datepicker('setDate', this.props.select, false);
    },

    componentDidUpdate: function () {
        console.log('update');
        $(this.getDOMNode()).datepicker('setDate', this.props.select, false);
    }
});


var ProjectInfo = React.createClass({

    mixins: [BindStore(ProjectStore)],

    getInitialState: function () {
        return {
            projects: []
        };
    },

    componentWillReceiveProps: function (nextProps) {
        var date = nextProps.date;
        if (date !== this.props.date) {
            DataAPI.getProjects({
                start: date,
                end: date
            });
        }
    },

    render: function () {
        var projects = this.state.projects;
        var date = this.props.date;
        return (
            <div className="ltt_c-projectInfo">
                {projects.map(function (project) {
                    return (
                        <div className="ltt_c-projectInfo-project">
                            <div className="ltt_c-projectInfo-project-header">
                                <div className="ltt_c-projectInfo-title">
                                    <Link to={'/projects/' + project._id}>{project.name}</Link>
                                </div>
                                <Progress max={100} value={project.progress}/>
                            </div>
                            <TaskInfo tasks={project.lastTasks} date={date}/>
                        </div>
                    );
                })}
            </div>
        );
    },

    componentDidMount: function () {
        var date = this.props.date;
        DataAPI.getProjects({
            start: date,
            end: date
        });
    },

    getStateFromStores: function () {
        return {
            projects: ProjectStore.getData()
        };
    },

});


var TaskInfo = React.createClass({
    getDefaultProps: function () {
        return {
            tasks: []
        };
    },

    render: function () {
        var className = 'ltt_c-taskInfo '
        if (this.props.className) {
             className += this.props.className;
        }
        var tasks = this.props.tasks;
        var date = this.props.date;
        if (date) {
            tasks = tasks.filter(function (task) {
                var lastActiveTime = new Moment(task.lastActiveTime);
                if (lastActiveTime.format('YYYY-MM-DD') === date) {
                    if (_.isEmpty(task.subTasks)) { return true; }
                    task.subTasks = task.subTasks.filter(function (task) {
                        var lastActiveTime = new Moment(task.lastActiveTime);
                        return lastActiveTime.format('YYYY-MM-DD') === date;
                    });
                    return true;
                } else {
                    return false;
                }
            });
        }
        return (
            <div className={className}>
                {tasks.map(function (task) {
                    return (
                        <div className="ltt_c-taskInfo-task">
                            <div className="ltt_c-taskInfo-task-header">
                                <div className="ltt_c-taskInfo-task-title">
                                    {task.name}
                                </div>
                                <Progress max={100} value={task.progress}/>
                            </div>
                            <TaskInfo className="subtask" tasks={task.subTasks} date={date}/>
                        </div>
                    );
                })}
            </div>
        )
    }
})

/*
var FilterableList = React.createClass({

    getDefaultProps: function () {
        return {
            items: []
        };
    },
    render: function () {
        var select = this.props.select;
        var items = this.props.items;
        return (
            <div className="ltt_c-filterableList">
                <SearchBox placeholder="search here"/>
                <div className="ltt_c-filterableList-list scrollable">
                {items.map(function (item) {
                    var selected = item.key === select;
                    return (<ListItem {...item} selected={selected} onClick={this.props.onItemClick}/>)
                }, this)}
                </div>
            </div>
        );
    }
});

var ListItem = React.createClass({
    render: function () {
        var className = "ltt_c-filterableList-list-item";
        if (this.props.selected) {
            className = className + ' selected';
        }
        return (
            <div className={className} onClick={this.onClick}>
                <div className="ltt_c-filterableList-list-item-name">{this.props.name}</div>
            </div>
        );
    },

    onClick: function (e) {
        this.props.onClick(e, this.props);
    }
})*/


module.exports = Page;